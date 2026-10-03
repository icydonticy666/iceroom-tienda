import { PRODUCTS } from "../_lib/catalog.js";
import { createIntent, requireDb } from "../_lib/intents.js";
import { json, paymentOrigin, testAccess } from "../_lib/http.js";

export async function onRequestPost({ request, env }) {
  if (!paymentOrigin(env) || !env.MP_ACCESS_TOKEN || !env.MP_PUBLIC_KEY || !env.MP_WEBHOOK_SECRET || !env.PAYHIP_API_KEY || !env.ORDER_SECRET) {
    return json({ error: "Pago con tarjeta no configurado." }, 503);
  }
  try {
    requireDb(env);
    const body = await request.json();
    if (PRODUCTS[body?.product]?.testOnly && !testAccess(body?.prueba, env)) return json({ error: "Producto no disponible." }, 400);
    const intent = await createIntent(env, body?.product, "mp", "", body?.coupon);
    if (!intent) return json({ error: "Producto no disponible." }, 400);
    return json({ claim: intent.claim, amount: intent.amount, publicKey: env.MP_PUBLIC_KEY });
  } catch (error) {
    if (String(error?.message || "").startsWith("coupon-")) return json({ error: "Ese cupón no es válido para esta compra." }, 400);
    return json({ error: "No se pudo preparar el pago." }, 503);
  }
}
