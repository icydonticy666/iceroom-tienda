import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as invitar } from '../api/swap-invitacion.js';

// D1 falso con lo justo para invitaciones y descargas.
function dbFalsa(invitaciones) {
  const usos = new Set();
  const descargas = [];
  const stmt = (sql, v = []) => ({
    bind: (...x) => stmt(sql, x),
    async run() {
      if (/^UPDATE swap_invitaciones SET usados = usados \+ 1/.test(sql)) {
        const i = invitaciones[v[0]];
        if (i && i.activa && i.usados < i.cupos) { i.usados++; return { meta: { changes: 1 } }; }
        return { meta: { changes: 0 } };
      }
      if (/^UPDATE swap_invitaciones SET usados = usados - 1/.test(sql)) invitaciones[v[0]].usados--;
      if (/^INSERT OR IGNORE INTO swap_invitacion_usos/.test(sql)) usos.add(v[0] + '|' + v[1]);
      if (/^DELETE FROM swap_invitacion_usos/.test(sql)) usos.delete(v[0] + '|' + v[1]);
      if (/^INSERT INTO swap_descargas/.test(sql)) descargas.push(v);
      return { meta: { changes: 1 } };
    },
    async first() {
      if (/FROM swap_invitaciones/.test(sql)) return invitaciones[v[0]] || null;
      if (/FROM swap_invitacion_usos/.test(sql)) return usos.has(v[0] + '|' + v[1]) ? {} : null;
      return null;
    },
  });
  return { prepare: (sql) => stmt(sql), descargas, usos };
}

let avisos = [];
let licenciasOk = true;
globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes('swap-licencias')) {
    avisos.push(JSON.parse(init.body));
    return new Response('{}', { status: licenciasOk ? 200 : 500 });
  }
  return new Response('{}');
};

const preparar = (cupos = 2) => {
  const invitaciones = { PRODUCTORES26: { cupos, usados: 0, activa: 1 } };
  return { invitaciones, env: { ORDER_SECRET: 's', SWAP_LICENCIAS_TOKEN: 't', PAYMENTS_DB: dbFalsa(invitaciones) } };
};
const pedir = (env, cuerpo) => invitar({ env, request: new Request('https://iceroom.cl/api/swap-invitacion', {
  method: 'POST', body: JSON.stringify(cuerpo) }) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

test('una invitación válida activa Pro para el correo y entrega la descarga', async () => {
  avisos = []; licenciasOk = true;
  const { env, invitaciones } = preparar();
  const r = await pedir(env, { codigo: 'PRODUCTORES26', email: 'Prod@Gmail.com', os: 'mac' });
  assert.equal(r.status, 200);
  assert.match(r.url, /^\/swap\/mac\?e=\d+&t=/);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].email, 'prod@gmail.com');
  assert.equal(avisos[0].proveedor, 'invitacion');
  assert.equal(avisos[0].estado, 'completado');
  assert.equal(invitaciones.PRODUCTORES26.usados, 1);
  assert.equal(env.PAYMENTS_DB.descargas.length, 1);
});

test('el mismo correo no gasta otro cupo y repite el mismo pago (idempotente)', async () => {
  avisos = []; licenciasOk = true;
  const { env, invitaciones } = preparar();
  await pedir(env, { codigo: 'PRODUCTORES26', email: 'a@b.cl', os: 'windows' });
  await pedir(env, { codigo: 'PRODUCTORES26', email: 'a@b.cl', os: 'intel' });
  assert.equal(invitaciones.PRODUCTORES26.usados, 1);
  assert.equal(avisos[0].pago, avisos[1].pago);
});

test('sin cupos, con código inválido o con el campo trampa no se activa nada', async () => {
  avisos = []; licenciasOk = true;
  const { env } = preparar(1);
  await pedir(env, { codigo: 'PRODUCTORES26', email: 'uno@b.cl', os: 'windows' });
  avisos = [];
  assert.equal((await pedir(env, { codigo: 'PRODUCTORES26', email: 'dos@b.cl', os: 'windows' })).status, 409);
  assert.equal((await pedir(env, { codigo: 'NOEXISTE99', email: 'dos@b.cl', os: 'windows' })).status, 404);
  assert.equal((await pedir(env, { codigo: 'PRODUCTORES26', email: 'dos@b.cl', os: 'windows', web: 'x' })).status, 404);
  assert.equal(avisos.length, 0);
});

test('si el servidor de licencias falla, el cupo se devuelve', async () => {
  avisos = []; licenciasOk = false;
  const { env, invitaciones } = preparar();
  const r = await pedir(env, { codigo: 'PRODUCTORES26', email: 'x@b.cl', os: 'windows' });
  assert.equal(r.status, 503);
  assert.equal(invitaciones.PRODUCTORES26.usados, 0);
  assert.equal(env.PAYMENTS_DB.usos.size, 0);
  licenciasOk = true;
});
