import test from 'node:test';
import assert from 'node:assert/strict';
import { swapCommerce } from './swap-commerce.js';
import { onRequestGet } from '../api/swap-access.js';
import { PRODUCTS } from './catalog.js';
import { USD_CENTS } from './campaign.js';
import { createIntent } from './intents.js';
import { onRequestGet as paypal } from '../api/paypal-checkout.js';

test('SWAP no acepta cobros sin producto y entrega configurados; Free no publica descargas', async () => {
  const result = await onRequestGet({ env: { ADMIN_TOKEN: 'privado' } }).json();
  assert.equal(result.plans.pro.ready, false);
  assert.equal(result.plans.bundle.ready, false);
  assert.equal(result.plans.pro.productKey, null);
  assert.equal(result.free.downloadReady, false);
  assert.ok(!JSON.stringify(result).includes('privado'));
});

test('un ID de otro producto nunca se cobra como SWAP, aunque se active el indicador', () => {
  const result = swapCommerce({ SWAP_PRO_DELIVERY_READY: '1', SWAP_PRO_PRODUCT_KEY: '0QEeV', SWAP_PACK_PRODUCT_KEY: 'xNaVU' });
  assert.equal(result.pro.ready, false);
  assert.equal(result.bundle.ready, false);
});

test('Free informa disponibilidad solo con firma y registro configurados, sin revelar secretos', async () => {
  for (const env of [{}, { ORDER_SECRET: 'clave-privada' }, { PAYMENTS_DB: {} }]) {
    assert.equal((await onRequestGet({ env }).json()).free.downloadReady, false);
  }
  const response = await onRequestGet({ env: { ORDER_SECRET: 'clave-privada', PAYMENTS_DB: {} } }).json();
  assert.equal(response.free.downloadReady, true);
  assert.ok(!JSON.stringify(response).includes('clave-privada'));
});

test('solo un producto Pro con plan y precio correctos puede enlazarse al checkout', t => {
  PRODUCTS.SWAPTEST = { key: 'SWAPTEST', clp: 9990, kind: 'download', checkout: 'b', swapAccess: 'pro', swapPlan: 'pro' };
  USD_CENTS.SWAPTEST = 999;
  t.after(() => { delete PRODUCTS.SWAPTEST; delete USD_CENTS.SWAPTEST; });
  const env = { SWAP_PRO_PRODUCT_KEY: 'SWAPTEST' };
  assert.equal(swapCommerce(env).pro.ready, false);
  env.SWAP_PRO_DELIVERY_READY = '1';
  const result = swapCommerce(env).pro;
  assert.equal(result.ready, true);
  assert.equal(result.clp, 9990);
  assert.equal(result.paypalUrl, '/api/paypal-checkout?product=SWAPTEST');
  USD_CENTS.SWAPTEST = 1999;
  assert.equal(swapCommerce(env).pro.ready, false);
});

test('Pritti Studio y Full Pritti Studio dan swap Pro y solo se cobran con su entrega configurada', async () => {
  const { swapProductReady } = await import('./swap-commerce.js');
  const { bundleCollection, priceOf } = await import('./catalog.js');
  const { daSwapPro } = await import('./swap-licencia.js');
  const studio = PRODUCTS.QLfl6, upgrade = PRODUCTS['95wzC'];
  // Contenido y entrega: ambos son bundles con colección propia y activan swap Pro.
  assert.ok(daSwapPro(studio) && daSwapPro(upgrade));
  assert.equal(bundleCollection(upgrade), '91zwOV2bzL');
  assert.equal(bundleCollection(studio), 'a6zYD8PkWq');
  // Precios: el upgrade es el Pack SWAP Pro (US$19.99 / $19.990) + US$5 → US$24.99 / $24.990.
  assert.equal(USD_CENTS['95wzC'], 2499);
  assert.equal(USD_CENTS['95wzC'] - USD_CENTS['8zVP2'], 500);
  assert.equal(USD_CENTS['95wzC'] - USD_CENTS.saPdL, 500);
  assert.equal(priceOf(upgrade, new Date('2026-11-05T12:00:00Z')), 24990);
  assert.equal(priceOf(studio, new Date('2026-11-05T12:00:00Z')), 29990);
  // Sin la variable exacta de cada plan no se cobran (ni con un ID de otro producto).
  const ready = { SWAP_PRO_DELIVERY_READY: '1', SWAP_STUDIO_PRODUCT_KEY: 'QLfl6', SWAP_UPGRADE_PRODUCT_KEY: '95wzC' };
  assert.equal(swapProductReady(ready, studio), true);
  assert.equal(swapProductReady(ready, upgrade), true);
  assert.equal(swapProductReady({ ...ready, SWAP_UPGRADE_PRODUCT_KEY: '' }, upgrade), false);
  assert.equal(swapProductReady({ ...ready, SWAP_UPGRADE_PRODUCT_KEY: 'QLfl6' }, upgrade), false);
  assert.equal(swapProductReady({ ...ready, SWAP_STUDIO_PRODUCT_KEY: '95wzC' }, studio), false);
  assert.equal(swapProductReady({ ...ready, SWAP_PRO_DELIVERY_READY: '0' }, studio), false);
  // Un secreto cargado por consola con salto de línea final sigue valiendo.
  assert.equal(swapProductReady({ ...ready, SWAP_STUDIO_PRODUCT_KEY: 'QLfl6\r\n' }, studio), true);
  const go = (env) => paypal({ env, request: new Request('https://iceroom.example/api/paypal-checkout?product=95wzC') });
  assert.equal(go({}).status, 404);
  assert.match(go(ready).headers.get('location'), /link=95wzC/);
});

test('el pedido en pesos de Full Pritti Studio lo arma el servidor a $24.990', async () => {
  const rows = [];
  const db = { prepare(sql) { return { bind(...args) { return { async run() { rows.push({ sql, args }); return { meta: { changes: 1 } }; }, async first() { return null; } }; } }; } };
  const ready = { PAYMENTS_DB: db, SWAP_PRO_DELIVERY_READY: '1', SWAP_UPGRADE_PRODUCT_KEY: '95wzC' };
  for (const provider of ['mp', 'flow']) {
    const intent = await createIntent(ready, '95wzC', provider, 'a@b.cl');
    assert.equal(intent.amount, 24990);
    assert.equal(intent.product.key, '95wzC');
  }
  assert.ok(rows.every(r => r.args[2] === '95wzC' && r.args[3] === 24990));
  // Sin la variable del plan (precio todavía no verificado en Payhip) no se crea ningún pedido.
  assert.equal(await createIntent({ ...ready, SWAP_UPGRADE_PRODUCT_KEY: '' }, '95wzC', 'flow', 'a@b.cl'), null);
});

test('el servidor bloquea directamente MP, Flow y PayPal antes de habilitar la entrega', async t => {
  PRODUCTS.SWAPBLOCKED = { key:'SWAPBLOCKED', clp:9990, kind:'download', checkout:'b', swapAccess:'pro', swapPlan:'pro' };
  USD_CENTS.SWAPBLOCKED=999;
  t.after(()=>{delete PRODUCTS.SWAPBLOCKED;delete USD_CENTS.SWAPBLOCKED;});
  const env={SWAP_PRO_PRODUCT_KEY:'SWAPBLOCKED',PAYMENTS_DB:{prepare(){throw Error('No debe crear pedidos');}}};
  for(const provider of ['mp','flow']) assert.equal(await createIntent(env,'SWAPBLOCKED',provider),null);
  const response=paypal({env,request:new Request('https://iceroom.example/api/paypal-checkout?product=SWAPBLOCKED')});
  assert.equal(response.status,404);
});
