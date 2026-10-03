import { getPayment, fulfill } from "../_lib/fulfill.js";
import { flowAsPayment, flowStatus } from "../_lib/flow.js";
import { bindPayment, getIntent, paymentMatchesIntent } from "../_lib/intents.js";
import { json, siteOrigin } from "../_lib/http.js";

export async function onRequestGet({ request, env }) {
  if (!env.PAYMENTS_DB) return json({ error: "Registro de pagos no configurado." }, 503);
  const claim = new URL(request.url).searchParams.get("claim");
  const intent = await getIntent(env, claim);
  if (!intent) return json({ error: "Pedido desconocido." }, 404);
  if (intent.provider === "mp" && intent.state === "processing" && !intent.payment_id && env.MP_ACCESS_TOKEN) {
    const now = Math.floor(Date.now() / 1000);
    const due = await env.PAYMENTS_DB.prepare(
      "UPDATE payment_intents SET last_reconcile_at = ? WHERE claim = ? AND payment_id IS NULL AND last_reconcile_at < ?"
    ).bind(now, intent.claim, now - 10).run();
    if (due.meta.changes === 1) {
      try {
        const ref = `tienda:${intent.product_key}:${intent.claim}:${intent.amount_clp}`;
        const search = new URL("https://api.mercadopago.com/v1/payments/search");
        search.searchParams.set("external_reference", ref);
        search.searchParams.set("sort", "date_created");
        search.searchParams.set("criteria", "desc");
        search.searchParams.set("limit", "2");
        const response = await fetch(search, { headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
        if (response.ok) {
          const data = await response.json();
          const matches = (Array.isArray(data.results) ? data.results : []).filter((p) => paymentMatchesIntent(p, intent));
          if (matches.length > 1) return json({ error: "Hay más de un cobro asociado al pedido. Contacta a soporte." }, 409);
          if (matches.length === 1) {
            if (!await bindPayment(env, intent, matches[0].id, matches[0].status)) {
              return json({ error: "El pedido requiere revisión manual." }, 409);
            }
            intent.payment_id = String(matches[0].id);
          }
        }
      } catch { /* La próxima consulta o el webhook volverán a intentar. */ }
    }
  }
  if (!intent.payment_id && !intent.provider_token) {
    if (intent.state === "rejected") return json({ status: "rejected" });
    return json({ status: "pending", message: "Esperando confirmación del proveedor." });
  }
  try {
    let payment;
    if (intent.provider === "flow") {
      if (!env.FLOW_API_KEY || !env.FLOW_SECRET_KEY) return json({ error: "Flow no configurado." }, 503);
      payment = flowAsPayment(await flowStatus(env, intent.provider_token));
    } else {
      if (!env.MP_ACCESS_TOKEN) return json({ error: "Mercado Pago no configurado." }, 503);
      payment = await getPayment(env, intent.payment_id);
    }
    if (!payment) return json({ status: "pending" });
    const result = await fulfill(env, payment, { claim: intent.claim, origin: siteOrigin(request, env),
      ip: request.headers.get("cf-connecting-ip") || "", ua: request.headers.get("user-agent") || "" });
    if (result.error) return json({ error: result.error }, result.status || 502);
    return json(result);
  } catch {
    return json({ error: "No se pudo confirmar el pago. Reintenta en unos minutos." }, 502);
  }
}
