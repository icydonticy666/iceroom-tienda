import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from './catalog.js';
import { fulfill } from './fulfill.js';
import { onRequestPost as payhipWebhook } from '../api/payhip-webhook.js';

// Producto de prueba que da swap Pro (los reales se agregan al crear el producto en Payhip).
PRODUCTS.SWPRO = { key: 'SWPRO', payhip: 'SwP1', name: 'swap Pro (prueba)', clp: 9500, kind: 'download', swapAccess: 'pro', swapPlan: 'pro' };

const API = 'clave-payhip-de-prueba';
const env = { PAYHIP_API_KEY: API, PAYHIP_WEBHOOK_KEY: 'k-secreta', SWAP_LICENCIAS_TOKEN: 't-licencias', ORDER_SECRET: 's' };
const firma = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(API)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

// fetch falso: registra los avisos a licencias y responde como Payhip al crear cupones.
let avisos = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes('swap-licencias')) {
    avisos.push({ auth: init.headers.Authorization, ...JSON.parse(init.body) });
    return new Response('{"ok":true}', { status: 200 });
  }
  if (String(url).startsWith('https://payhip.com/api/v2/coupons')) {
    const p = Object.fromEntries(new URLSearchParams(init.body));
    return new Response(JSON.stringify({ data: { ...p, percent_off: 100, usage_limit: 1 } }), { status: 200 });
  }
  return new Response('{}', { status: 200 });
};

function webhook(body, k = 'k-secreta') {
  return payhipWebhook({ env, request: new Request(`https://iceroom.cl/api/payhip-webhook?k=${k}`, {
    method: 'POST', body: JSON.stringify(body) }) });
}
const venta = (extra = {}) => ({ id: 'PH1', email: 'Cliente@Gmail.com', price: 999, type: 'paid', signature: firma,
  items: [{ product_key: 'SwP1' }], ...extra });

test('webhook de Payhip: rechaza sin la clave de la URL o con firma falsa', async () => {
  avisos = [];
  assert.equal((await webhook(venta(), 'otra')).status, 401);
  assert.equal((await webhook(venta({ signature: 'x'.repeat(64) }))).status, 401);
  assert.equal(avisos.length, 0);
});

test('webhook de Payhip: venta pagada de swap Pro activa Pro con el correo del comprador', async () => {
  avisos = [];
  assert.equal((await webhook(venta())).status, 200);
  assert.deepEqual(avisos, [{ auth: 'Bearer t-licencias', email: 'cliente@gmail.com', pago: 'PH1', proveedor: 'payhip', estado: 'completado' }]);
});

test('webhook de Payhip: ignora otros productos, cupones al 100% y reembolsos parciales', async () => {
  avisos = [];
  await webhook(venta({ items: [{ product_key: '0QEeV' }] }));
  await webhook(venta({ price: 0 }));
  await webhook(venta({ type: 'refunded', amount_refunded: 300 }));
  assert.equal(avisos.length, 0);
  await webhook(venta({ type: 'refunded', amount_refunded: 999 }));
  assert.equal(avisos[0].estado, 'cancelado');
});

test('invitación a productores: el producto gratis yp9EL sí activa Pro (y nada más gratis lo hace)', async () => {
  avisos = [];
  await webhook(venta({ id: 'INV1', price: 0, items: [{ product_key: 'yp9EL' }] }));
  assert.deepEqual(avisos, [{ auth: 'Bearer t-licencias', email: 'cliente@gmail.com', pago: 'INV1', proveedor: 'invitacion', estado: 'completado' }]);
  avisos = [];
  await webhook(venta({ id: 'X', price: 0, items: [{ product_key: '0QEeV' }] }));
  assert.equal(avisos.length, 0);
});

test('Mercado Pago aprobado y luego reembolsado: activa y quita Pro con el mismo pago', async () => {
  avisos = [];
  const pago = { id: 123456, status: 'approved', currency_id: 'CLP', transaction_amount: 9500,
    external_reference: `tienda:SWPRO:${'a'.repeat(32)}:9500`, payer: { email: 'pagador@gmail.com' } };
  const r = await fulfill(env, pago);
  assert.equal(r.status, 'approved');
  assert.deepEqual(avisos.map((a) => [a.pago, a.proveedor, a.estado]), [['123456', 'mp', 'completado']]);
  await fulfill(env, { ...pago, status: 'refunded' });
  assert.deepEqual(avisos.at(-1), { auth: 'Bearer t-licencias', email: 'pagador@gmail.com', pago: '123456', proveedor: 'mp', estado: 'cancelado' });
});

test('una compra que no es swap Pro no avisa a licencias', async () => {
  avisos = [];
  const otro = Object.keys(PRODUCTS).find((k) => !PRODUCTS[k].swapAccess && !PRODUCTS[k].testOnly && PRODUCTS[k].clp);
  await fulfill(env, { id: 99, status: 'approved', currency_id: 'CLP', transaction_amount: PRODUCTS[otro].clp,
    external_reference: `tienda:${otro}:${'b'.repeat(32)}:${PRODUCTS[otro].clp}`, payer: { email: 'x@gmail.com' } }).catch(() => {});
  assert.equal(avisos.length, 0);
});
