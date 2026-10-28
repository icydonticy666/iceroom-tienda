import { PRODUCTS, payhipKey } from "../_lib/catalog.js";
import { avisarLicencia, daSwapPro } from "../_lib/swap-licencia.js";

// Webhook de Payhip (Settings → Developer → Webhooks), para lo que se cobra dentro de Payhip
// (PayPal y tarjeta). URL: https://iceroom.cl/api/payhip-webhook?k=<PAYHIP_WEBHOOK_KEY>
// La «signature» de Payhip es sha256 de la API key, fija para toda notificación: por eso se
// exige además la clave secreta de la URL. Solo cuenta lo pagado (price > 0): las compras con
// el cupón 100% que entrega la tienda tras Mercado Pago/Flow ya se avisaron en fulfill.js.

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function igual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Claves de Payhip de los productos que dan swap Pro.
function clavesSwapPro() {
  return new Set(Object.values(PRODUCTS).filter(daSwapPro).map(payhipKey));
}

// Invitaciones a productores: producto gratis y oculto de Payhip («swap Pro — Producer Preview»,
// limitado en cantidad). Es la única compra de $0 que da Pro; se registra como proveedor
// «invitacion» para distinguirla de las ventas.
export const INVITACIONES = new Set(["yp9EL"]);

export async function onRequestPost({ request, env }) {
  if (!env.PAYHIP_API_KEY || !env.PAYHIP_WEBHOOK_KEY) return new Response(null, { status: 503 });
  const k = new URL(request.url).searchParams.get("k") || "";
  if (!igual(k, env.PAYHIP_WEBHOOK_KEY)) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !igual(String(body.signature || ""), await sha256(env.PAYHIP_API_KEY))) {
    return new Response(null, { status: 401 });
  }
  const estado = body.type === "paid" ? "completado" : body.type === "refunded" ? "cancelado" : "";
  const claves = clavesSwapPro();
  const llaves = (body.items || []).map((item) => String(item?.product_key || ""));
  const invitacion = estado === "completado" && llaves.some((k) => INVITACIONES.has(k));
  const daPro = invitacion || llaves.some((k) => claves.has(k));
  if (!estado || !daPro || (!invitacion && !(Number(body.price) > 0))) return new Response(null, { status: 200 });
  // Un reembolso parcial no quita Pro; solo el total.
  if (estado === "cancelado" && Number(body.amount_refunded) < Number(body.price)) return new Response(null, { status: 200 });
  const ok = await avisarLicencia(env, {
    email: String(body.email || "").trim().toLowerCase(), pago: String(body.id || ""),
    proveedor: invitacion ? "invitacion" : "payhip", estado,
  });
  return new Response(null, { status: ok ? 200 : 500 });  // 500: Payhip reintenta
}
