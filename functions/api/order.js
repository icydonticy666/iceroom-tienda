import { fulfill, getPayment } from "../_lib/fulfill.js";
import { json, siteOrigin } from "../_lib/http.js";

export async function onRequestGet({ request, env }) {
  if (!env.MP_ACCESS_TOKEN) return json({ error: "Falta el Access Token de Mercado Pago." }, 503);

  const url = new URL(request.url);
  const paymentId = url.searchParams.get("payment_id") || url.searchParams.get("collection_id");
  const claim = url.searchParams.get("claim") || "";
  if (!/^[a-f0-9]{32}$/.test(claim)) return json({ error: "Falta el comprobante de esta compra." }, 400);
  if (!paymentId) return json({ status: "missing" });

  try {
    const payment = await getPayment(env, paymentId);
    if (!payment) return json({ error: "Mercado Pago no tiene ese pago." }, 404);
    const result = await fulfill(env, payment, {
      claim,
      origin: siteOrigin(request, env),
      ip: request.headers.get("cf-connecting-ip") || "",
      ua: request.headers.get("user-agent") || "",
    });
    if (result.ignore || result.error === "claim") {
      return json({ error: "Ese pago no corresponde a esta compra." }, 404);
    }
    if (result.error) return json({ error: result.error }, result.status || 400);
    return json(result);
  } catch (error) {
    const auth = error.message === "payhip-auth";
    return json({
      error: auth ? "Payhip rechazó la API key." : "No pude confirmar el pago. Recarga en un momento.",
    }, auth ? 503 : 502);
  }
}
