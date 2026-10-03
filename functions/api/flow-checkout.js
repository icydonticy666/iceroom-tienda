import { PRODUCTS } from "../_lib/catalog.js";
import { createFlowOrder } from "../_lib/flow.js";
import { createIntent, setProviderOrder } from "../_lib/intents.js";
import { json, paymentOrigin, testAccess } from "../_lib/http.js";

export async function onRequestPost({ request, env }) {
  if (!env.FLOW_API_KEY || !env.FLOW_SECRET_KEY || !env.PAYHIP_API_KEY || !env.ORDER_SECRET) {
    return json({ error: "Pago mediante Flow no configurado." }, 503);
  }
  if (!env.PAYMENTS_DB) return json({ error: "Registro de pagos no configurado." }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }

  const product = PRODUCTS[body?.product];
  const email = String(body?.email || "").trim().toLowerCase();
  if (!product || (product.testOnly && !testAccess(body?.prueba, env))) return json({ error: "Ese producto no está a la venta en pesos." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Flow necesita un correo para el comprobante." }, 400);
  }

  const origin = paymentOrigin(env);
  if (!origin) return json({ error: "Flow requiere un dominio HTTPS público." }, 503);
  let intent;
  try {
    intent = await createIntent(env, product.key, "flow", email, body?.coupon);
  } catch (error) {
    if (String(error?.message || "").startsWith("coupon-")) return json({ error: "Ese cupón no es válido para esta compra." }, 400);
    return json({ error: "No se pudo preparar el descuento." }, 503);
  }
  const price = intent.amount;
  const claim = intent.claim;
  const optional = JSON.stringify({ product: product.key, clp: price, claim });

  try {
    const order = await createFlowOrder(env, {
      apiKey: env.FLOW_API_KEY,
      commerceOrder: claim,
      subject: product.name.slice(0, 90),
      currency: "CLP",
      amount: String(price),
      email,
      ...(env.FLOW_PAYMENT_METHOD_ID ? { paymentMethod: String(env.FLOW_PAYMENT_METHOD_ID) } : {}),
      urlConfirmation: `${origin}/api/flow-webhook`,
      urlReturn: `${origin}/volver-flow/${claim}`,
      optional,
    });
    if (!order.url || !order.token) return json({ error: "Flow no devolvió el checkout." }, 502);
    await setProviderOrder(env, claim, order.token);
    return json({ url: `${order.url}?token=${encodeURIComponent(order.token)}`, clp: price });
  } catch (error) {
    return json({ error: "No se pudo iniciar Flow. Vuelve a intentarlo." }, 502);
  }
}
