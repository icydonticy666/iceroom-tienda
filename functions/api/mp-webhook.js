import { fulfill, getPayment } from "../_lib/fulfill.js";
import { siteOrigin } from "../_lib/http.js";
import { mpSignatureOk } from "../_lib/signature.js";

function empty(status = 200) {
  return new Response(null, { status });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");
  let type = url.searchParams.get("type") || url.searchParams.get("topic") || "";

  if (request.method === "POST") {
    const text = await request.text();
    if (text) {
      try {
        const body = JSON.parse(text);
        paymentId = paymentId || body?.data?.id;
        type = type || body?.type || "";
      } catch {
        return empty(400);
      }
    }
  }

  if (type && type !== "payment") return empty(200);
  if (!paymentId) return empty(200);

  if (!env.MP_WEBHOOK_SECRET) return empty(503);
  const signed = await mpSignatureOk({
    secret: env.MP_WEBHOOK_SECRET,
    dataId: url.searchParams.get("data.id") || paymentId,
    requestId: request.headers.get("x-request-id"),
    signatureHeader: request.headers.get("x-signature"),
  });
  if (!signed) return empty(401);
  if (!env.MP_ACCESS_TOKEN) return empty(503);

  try {
    const payment = await getPayment(env, paymentId);
    if (!payment) return empty(200);
    const result = await fulfill(env, payment, { origin: siteOrigin(request, env) });
    if (result.error) return empty(result.status >= 500 ? 500 : 200);
    return empty(200);
  } catch (error) {
    return empty(500);
  }
}
