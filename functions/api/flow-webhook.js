import { fulfill } from "../_lib/fulfill.js";
import { flowAsPayment, flowStatus } from "../_lib/flow.js";
import { siteOrigin } from "../_lib/http.js";
import { getIntent } from "../_lib/intents.js";

export async function onRequestPost({ request, env }) {
  if (!env.FLOW_API_KEY || !env.FLOW_SECRET_KEY) return new Response(null, { status: 503 });
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  if (!token) return new Response(null, { status: 200 });
  try {
    const status = await flowStatus(env, String(token));
    const intent = await getIntent(env, status.commerceOrder);
    if (!intent || intent.provider !== "flow" || intent.provider_token !== String(token)) {
      return new Response(null, { status: 200 });
    }
    const result = await fulfill(env, flowAsPayment(status), { origin: siteOrigin(request, env) });
    if (result.error && result.status >= 500) return new Response(null, { status: 500 });
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 500 });
  }
}
