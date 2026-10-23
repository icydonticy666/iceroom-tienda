import { PRODUCTS } from "../_lib/catalog.js";
import { createIntent, setProviderOrder } from "../_lib/intents.js";
import { json, paymentOrigin, testAccess } from "../_lib/http.js";

/**
 * "Cuenta Mercado Pago": Checkout Pro solo para usuarios con sesión en MP (purpose wallet_purchase).
 * MP ya conoce al comprador, así que su antifraude rechaza mucho menos que con la tarjeta tipeada en la tienda.
 * Entrega: el comprador vuelve por /volver/<claim> (api/order) y, si no vuelve, llega el webhook de siempre.
 */
export async function onRequestPost({ request, env }) {
  const origin = paymentOrigin(env);
  if (!origin || !env.MP_ACCESS_TOKEN || !env.MP_WEBHOOK_SECRET || !env.PAYHIP_API_KEY || !env.ORDER_SECRET || !env.PAYMENTS_DB) {
    return json({ error: "Pago con Mercado Pago no configurado." }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }
  const product = PRODUCTS[body?.product];
  if (!product || (product.testOnly && !testAccess(body?.prueba, env))) return json({ error: "Producto no disponible." }, 400);

  let intent;
  try {
    intent = await createIntent(env, product.key, "mp", "", body?.coupon, {
      ...(body?.attribution || {}),
      clientIp: request.headers.get("cf-connecting-ip") || "",
      userAgent: request.headers.get("user-agent") || "",
    }, body?.offer);
  } catch (error) {
    if (error?.message === "coupon-cyber-active") return json({ error: "El 50% de la promo ya está aplicado. No es acumulable con otros cupones." }, 400);
    if (String(error?.message || "").startsWith("coupon-") || error?.message === "offer-no-coupon") return json({ error: "Esta oferta ya tiene aplicado el descuento máximo." }, 400);
    return json({ error: "No se pudo preparar el pago." }, 503);
  }
  if (!intent) return json({ error: "Producto no disponible." }, 400);

  const back = `${origin}/volver/${intent.claim}`;
  // Vence en 2 horas para que un precio de promo no quede abierto después de terminar.
  const expires = new Date(Date.now() + 2 * 3600 * 1000).toISOString().replace("Z", "+00:00");
  try {
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        "content-type": "application/json",
        "X-Idempotency-Key": intent.idempotencyKey,
      },
      body: JSON.stringify({
        purpose: "wallet_purchase",
        items: [{
          id: product.key,
          title: product.name.slice(0, 120),
          description: "Producto digital descargable",
          category_id: "others",
          quantity: 1,
          currency_id: "CLP",
          unit_price: intent.amount,
        }],
        external_reference: `tienda:${product.key}:${intent.claim}:${intent.amount}`,
        notification_url: `${origin}/api/mp-webhook`,
        back_urls: { success: back, pending: back, failure: back },
        auto_return: "approved",
        statement_descriptor: "ICEROOM",
        expires: true,
        expiration_date_to: expires,
      }),
    });
    const preference = await response.json().catch(() => ({}));
    if (!response.ok || !preference.id || !preference.init_point) {
      console.log(JSON.stringify({ wallet_error: response.status, message: preference?.message || "" }));
      return json({ error: "Mercado Pago no respondió. Prueba con Webpay." }, 502);
    }
    await setProviderOrder(env, intent.claim, String(preference.id));
    return json({ url: preference.init_point, claim: intent.claim });
  } catch {
    return json({ error: "No se pudo conectar con Mercado Pago. Prueba con Webpay." }, 502);
  }
}
