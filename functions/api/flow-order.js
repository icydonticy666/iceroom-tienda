import { fulfill } from "../_lib/fulfill.js";
import { flowAsPayment, flowStatus } from "../_lib/flow.js";
import { json, siteOrigin } from "../_lib/http.js";

export async function onRequestGet({ request, env }) {
  if (!env.FLOW_API_KEY || !env.FLOW_SECRET_KEY) {
    return json({ error: "Faltan la API key y la secret key de Flow." }, 503);
  }
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const claim = url.searchParams.get("claim") || "";
  if (!/^[a-f0-9]{32}$/.test(claim) || !token) {
    return json({ error: "Falta el comprobante de esta compra." }, 400);
  }

  try {
    const status = await flowStatus(env, token);
    const payment = flowAsPayment(status);
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
      error: auth ? "Payhip rechazó la API key." : "No pude confirmar el pago en Flow. Recarga en un momento.",
    }, auth ? 503 : 502);
  }
}
