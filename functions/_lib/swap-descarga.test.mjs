import test from 'node:test';
import assert from 'node:assert/strict';
import { enlaceFirmado, firmaValida, VIGENCIA } from './swap-descarga.js';
import { onRequestPost as api } from '../api/swap-descarga.js';
import { onRequestGet as descargar } from '../swap/[os].js';

// D1 falso: guarda lo que se inserta en swap_descargas.
function dbFalsa() {
  const filas = [];
  return {
    filas,
    prepare(sql) {
      return { bind: (...v) => ({ run: async () => { if (/^INSERT/.test(sql)) filas.push(v); } }), run: async () => {} };
    },
  };
}
const env = () => ({ ORDER_SECRET: 'secreto', PAYMENTS_DB: dbFalsa() });
const pedir = (e, cuerpo) => api({ env: e, request: new Request('https://iceroom.cl/api/swap-descarga', {
  method: 'POST', body: JSON.stringify(cuerpo) }) }).then((r) => r.json());
const bajar = (e, ruta, os) => descargar({ env: e, params: { os }, request: new Request('https://iceroom.cl' + ruta) });

test('la firma vale solo para su sistema y hasta que vence', async () => {
  const ahora = 2_000_000_000;
  const url = new URL('https://x' + await enlaceFirmado('s', 'mac', ahora));
  const [e, t] = [url.searchParams.get('e'), url.searchParams.get('t')];
  assert.equal(await firmaValida('s', 'mac', e, t, ahora), true);
  assert.equal(await firmaValida('s', 'windows', e, t, ahora), false);
  assert.equal(await firmaValida('otro', 'mac', e, t, ahora), false);
  assert.equal(await firmaValida('s', 'mac', e, t.replace(/.$/, '0') === t ? t.replace(/.$/, '1') : t.replace(/.$/, '0'), ahora), false);
  assert.equal(await firmaValida('s', 'mac', e, t, ahora + VIGENCIA + 1), false);
});

test('pedir la descarga guarda el correo y entrega un enlace que sí descarga', async () => {
  const e = env();
  const r = await pedir(e, { email: ' Productor@Gmail.com ', os: 'windows' });
  assert.deepEqual(e.PAYMENTS_DB.filas.map((f) => f.slice(0, 2)), [['productor@gmail.com', 'windows']]);
  const res = await bajar(e, r.url, 'windows');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /github\.com\/icydonticy666\/swap-releases\/.*windows-instalador\.exe$/);
});

test('sin firma, /swap/<os> vuelve al formulario de correo', async () => {
  const res = await bajar(env(), '/swap/mac', 'mac');
  assert.equal(res.headers.get('location'), '/swap.html?descargar=mac');
});

test('rechaza correos inválidos y no guarda a los bots (campo trampa)', async () => {
  const e = env();
  assert.ok((await pedir(e, { email: 'no-es-correo', os: 'windows' })).error);
  const bot = await pedir(e, { email: 'bot@spam.com', os: 'intel', web: 'http://spam' });
  assert.ok(bot.url);
  assert.equal(e.PAYMENTS_DB.filas.length, 0);
});
