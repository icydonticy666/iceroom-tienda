import { swapCommerce } from '../_lib/swap-commerce.js';
import { json } from '../_lib/http.js';

// Solo configuración pública. No devuelve claves, correos ni enlaces de descarga.
export function onRequestGet({ env }) {
  return json({ plans: swapCommerce(env), free: { downloadReady: Boolean(env?.ORDER_SECRET && env?.PAYMENTS_DB) } });
}
