import { CYBER, cyberActive, cyberPrice, USD_CENTS } from '../_lib/campaign.js';
import { PRODUCTS, priceOf } from '../_lib/catalog.js';
import { json } from '../_lib/http.js';

export function onRequestGet() {
  const now = new Date();
  const active = cyberActive(now);
  const products = {};
  for (const [key, cents] of Object.entries(USD_CENTS)) {
    products[key] = {
      usd: active ? cyberPrice(cents) : cents, regularUsd: cents,
      clp: priceOf(PRODUCTS[key], now), regularClp: PRODUCTS[key].clp,
    };
  }
  return json({ ...CYBER, active, serverTime: now.toISOString(), products });
}
