import assert from 'node:assert/strict';
import test from 'node:test';
import { CYBER, cyberActive, cyberPrice, USD_CENTS } from './campaign.js';
import { PRODUCTS, priceOf, allowedPrices } from './catalog.js';
import { couponQuote } from './discounts.js';
import { onRequestGet } from '../api/promotion.js';
import { createIntent } from './intents.js';

function duringCampaign(t) {
  const enabled = CYBER.enabled;
  CYBER.enabled = true;
  t.after(() => { CYBER.enabled = enabled; });
  t.mock.timers.enable({apis:['Date'],now:new Date(CYBER.startsAt)});
}

test('la campaña dura 72 horas y respeta ambos límites del servidor', t => {
  duringCampaign(t);
  const start = Date.parse(CYBER.startsAt), end = Date.parse(CYBER.endsAt);
  assert.equal(end-start,72*3600000);
  assert.equal(cyberActive(start-1),false);
  assert.equal(cyberActive(start),true);
  assert.equal(cyberActive(end-1),true);
  assert.equal(cyberActive(end),false);
  assert.equal(priceOf(PRODUCTS['0QEeV'],new Date(end)),12990);
});

test('todos los productos reales reciben 25%, incluida la plantilla con adicional', t => {
  duringCampaign(t);
  assert.equal(Object.keys(USD_CENTS).length,14);
  for (const product of Object.values(PRODUCTS).filter(p=>!p.testOnly)) {
    assert.ok(USD_CENTS[product.key]);
    assert.equal(priceOf(product),product.clp-Math.round(product.clp*.25));
    assert.ok(allowedPrices(product).includes(priceOf(product)));
  }
  assert.equal(priceOf(PRODUCTS['0QEeV']),9742);
  assert.equal(priceOf(PRODUCTS.xNaVU),11985);
  assert.equal(cyberPrice(1299),974);
  assert.equal(cyberPrice(1598),1198);
  assert.equal(priceOf(PRODUCTS.PRUEBA350),350);
});

test('el precio del checkout coincide con la oferta pública sin depender del navegador', async t => {
  duringCampaign(t);
  const offer=await onRequestGet().json();
  assert.equal(offer.active,true);
  assert.equal(offer.products['0QEeV'].regularUsd,1299);
  for (const provider of ['mp','flow']) {
    let saved;
    const env={PAYMENTS_DB:{prepare(){return {bind(...args){saved=args;return {async run(){}};}};}}};
    const intent=await createIntent(env,'0QEeV',provider);
    assert.equal(intent.amount,offer.products['0QEeV'].clp);
    assert.equal(saved[3],9742);
  }
});

test('Cyber no se acumula con un segundo cupón', async t => {
  duringCampaign(t);
  await assert.rejects(couponQuote({},PRODUCTS['0QEeV'],'OTRO20',9742),/coupon-cyber-active/);
});

test('al vencer se oculta la campaña y vuelven los importes normales', async t => {
  duringCampaign(t);
  t.mock.timers.setTime(Date.parse(CYBER.endsAt));
  const offer=await onRequestGet().json();
  assert.equal(offer.active,false);
  assert.equal(offer.products.xNaVU.clp,15980);
  assert.equal(offer.products.xNaVU.usd,1598);
});
