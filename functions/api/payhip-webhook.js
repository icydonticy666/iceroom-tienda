import { PRODUCTS, payhipKey } from "../_lib/catalog.js";
import { avisarLicencia, daSwapPro } from "../_lib/swap-licencia.js";
import { cancelarPorPago, iniciarProyecto, servicioDe } from "../_lib/proyectos.js";

// Webhook de Payhip (Settings → Developer → Webhooks), para lo que se cobra dentro de Payhip
// (PayPal y tarjeta). URL: https://iceroom.cl/api/payhip-webhook?k=<PAYHIP_WEBHOOK_KEY>
// La «signature» de Payhip es sha256 de la API key, fija para toda notificación: por eso se
// exige además la clave secreta de la URL. Lo pagado da Pro; lo de $0 da Pro si es invitación o
// regalo (cupón hecho a mano), no si es la entrega de un pago de la tienda (ver esEntregaDeLaTienda).

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

// Una orden de $0 de un producto con swap Pro puede ser (a) la entrega de un pago hecho en la
// tienda (Mercado Pago/Flow → cupón 100% «CL…»), que fulfill.js ya avisó con el id de ese pago y
// cuyo reembolso lo quita, o (b) un regalo: un cupón 100% creado a mano en Payhip (p. ej. «JK_37»).
// Payhip no manda el código del cupón, así que se distingue por la tienda: si el correo tiene un
// pago aprobado de un producto swap Pro, es entrega y no se duplica; si no, es regalo y da Pro.
async function esEntregaDeLaTienda(env, email) {
  if (!env.PAYMENTS_DB) return false;
  const productos = Object.values(PRODUCTS).filter(daSwapPro).map((p) => p.key);
  const marcas = productos.map((_, i) => `?${i + 2}`).join(", ");
  const fila = await env.PAYMENTS_DB.prepare(
    `SELECT 1 FROM payment_intents WHERE lower(email) = ?1 AND state = 'approved' AND product_key IN (${marcas}) LIMIT 1`
  ).bind(email, ...productos).first().catch(() => null);
  return Boolean(fila);
}

// Crea (o cancela, si se reembolsa entero) el proyecto de cada servicio de la orden.
// Las órdenes de $0 no crean proyecto: son la entrega de un pago en pesos (que ya lo creó) y los
// regalos se crean a mano desde /estudio.
export async function procesarServicios(env, body, estado) {
  let servicios = [...new Set((body.items || []).map((item) => String(item?.product_key || "")).filter((k) => servicioDe(k)))];
  // Un bundle con servicio (Plantilla personalizada) trae dentro Plantilla a tu voz: un solo proyecto, el del bundle.
  const bundles = servicios.filter((k) => servicioDe(k).bundle);
  if (bundles.length) servicios = bundles;
  if (!estado || !servicios.length || !env.PAYMENTS_DB) return true;
  const email = String(body.email || "").trim().toLowerCase();
  const origin = env.PUBLIC_ORIGIN || "https://iceroom.cl";
  let ok = true;
  for (const key of servicios) {
    const pago = `${body.id}:${key}`;
    try {
      if (estado === "cancelado") {
        if (Number(body.amount_refunded) >= Number(body.price)) await cancelarPorPago(env, "payhip", pago);
        continue;
      }
      if (!(Number(body.price) > 0)) continue;
      const r = await iniciarProyecto(env, { producto: key, email, nombre: body.first_name || "", origen: "payhip", pago }, origin);
      if (!r) ok = false;
    } catch (error) {
      console.error(JSON.stringify({ payhip_servicio_error: String(error?.message || error), orden: body.id }));
      ok = false;
    }
  }
  return ok;
}

export async function onRequestPost({ request, env }) {
  if (!env.PAYHIP_API_KEY || !env.PAYHIP_WEBHOOK_KEY) return new Response(null, { status: 503 });
  const k = new URL(request.url).searchParams.get("k") || "";
  if (!igual(k, env.PAYHIP_WEBHOOK_KEY)) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !igual(String(body.signature || ""), await sha256(env.PAYHIP_API_KEY))) {
    return new Response(null, { status: 401 });
  }
  const estado = body.type === "paid" ? "completado" : body.type === "refunded" ? "cancelado" : "";
  // Servicios con seguimiento (Plantilla a tu voz, Mezcla + Master). Si falla, 500 y Payhip reintenta:
  // crear el proyecto es idempotente por (payhip, id de la orden).
  const serviciosOk = await procesarServicios(env, body, estado);
  if (!serviciosOk) return new Response(null, { status: 500 });
  const claves = clavesSwapPro();
  const llaves = (body.items || []).map((item) => String(item?.product_key || ""));
  const invitacion = estado === "completado" && llaves.some((k) => INVITACIONES.has(k));
  const daPro = invitacion || llaves.some((k) => claves.has(k));
  if (!estado || !daPro) return new Response(null, { status: 200 });
  const email = String(body.email || "").trim().toLowerCase();
  const gratis = !(Number(body.price) > 0);
  let proveedor = invitacion ? "invitacion" : "payhip";
  if (gratis && !invitacion) {
    // Reembolsar una orden de $0 no tiene sentido; y una entrega de la tienda ya está avisada.
    if (estado !== "completado" || await esEntregaDeLaTienda(env, email)) return new Response(null, { status: 200 });
    proveedor = "regalo";
  }
  // Un reembolso parcial no quita Pro; solo el total.
  if (estado === "cancelado" && Number(body.amount_refunded) < Number(body.price)) return new Response(null, { status: 200 });
  const ok = await avisarLicencia(env, { email, pago: String(body.id || ""), proveedor, estado });
  return new Response(null, { status: ok ? 200 : 500 });  // 500: Payhip reintenta
}
