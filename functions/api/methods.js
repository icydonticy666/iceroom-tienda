import { json, paymentOrigin, testAccess } from "../_lib/http.js";

/** Mientras CHECKOUT_MODE no sea "live", tarjeta y Flow solo se ofrecen con ?prueba=<TEST_KEY> (compras de prueba). */
export async function onRequestGet({ request, env }) {
  const testing = env.CHECKOUT_MODE !== "live" && !testAccess(new URL(request.url).searchParams.get("prueba"), env);
  let databaseReady = false;
  if (env.PAYMENTS_DB) {
    try {
      await env.PAYMENTS_DB.prepare("SELECT claim FROM payment_intents LIMIT 1").first();
      await env.PAYMENTS_DB.prepare("SELECT payment_id FROM payment_fulfillments LIMIT 1").first();
      databaseReady = true;
    } catch { /* El binding existe, pero todavía falta aplicar el esquema. */ }
  }
  const delivery = Boolean(!testing && databaseReady && paymentOrigin(env) && env.PAYHIP_API_KEY && env.ORDER_SECRET);
  return json({
    card: Boolean(delivery && env.MP_PUBLIC_KEY && env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET),
    flow: Boolean(delivery && env.FLOW_API_KEY && env.FLOW_SECRET_KEY),
  });
}
