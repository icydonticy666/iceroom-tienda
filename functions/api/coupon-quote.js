import { PRODUCTS, sellableInClp } from "../_lib/catalog.js";
import { couponQuote } from "../_lib/discounts.js";
import { currentPrice } from "../_lib/intents.js";
import { json } from "../_lib/http.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const product = PRODUCTS[body?.product];
  if (!product || !sellableInClp(product)) return json({ error: "Producto no disponible en pesos." }, 400);
  try {
    const base = await currentPrice(env, product);
    const quote = await couponQuote(env, product, body?.coupon, base);
    return json({ coupon: quote.code, amount: quote.amount, discount: quote.discount });
  } catch (error) {
    const reason = String(error?.message || "");
    if (reason === 'coupon-cyber-active') return json({ error: 'El 25% Cyber Day ya está aplicado. No es acumulable con otros cupones.' }, 400);
    if (reason === "coupon-limit") return json({ error: "Este cupón ya alcanzó su límite de usos." }, 400);
    if (reason === "coupon-local-limit") return json({ error: "Este cupón tiene usos limitados y por seguridad se aplica desde PayPal." }, 400);
    if (reason === "coupon-minimum") return json({ error: "Este pedido no alcanza el mínimo del cupón." }, 400);
    if (reason === "coupon-local-minimum") return json({ error: "Este cupón deja el total bajo el mínimo local. Úsalo en PayPal." }, 400);
    if (reason === "coupon-service") return json({ error: "No pudimos validar el cupón. Intenta nuevamente." }, 503);
    return json({ error: "Cupón inválido para este producto." }, 400);
  }
}
