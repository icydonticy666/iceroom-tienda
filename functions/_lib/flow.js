export function flowBase(env) {
  const sandbox = env.FLOW_SANDBOX === "1" || env.FLOW_SANDBOX === "true";
  return sandbox ? "https://sandbox.flow.cl/api" : "https://www.flow.cl/api";
}

export async function flowSign(secret, params) {
  const toSign = Object.keys(params).filter((key) => key !== "s").sort()
    .map((key) => key + params[key]).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function flowRequest(env, path, params, method) {
  const signed = { ...params, s: await flowSign(env.FLOW_SECRET_KEY, params) };
  const body = new URLSearchParams(signed);
  const url = method === "GET"
    ? `${flowBase(env)}${path}?${body}`
    : `${flowBase(env)}${path}`;
  const res = await fetch(url, method === "GET" ? undefined : {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || "Flow rechazó el cobro.");
    error.status = res.status;
    throw error;
  }
  return data;
}

export function createFlowOrder(env, params) {
  return flowRequest(env, "/payment/create", params, "POST");
}

export function flowStatus(env, token) {
  return flowRequest(env, "/payment/getStatus", { apiKey: env.FLOW_API_KEY, token }, "GET");
}

/** Arma el mismo comprobante que Mercado Pago, para reutilizar la entrega del cupón. */
export function flowAsPayment(status) {
  let optional = {};
  try {
    optional = typeof status.optional === "string"
      ? JSON.parse(status.optional || "{}")
      : (status.optional || {});
  } catch {
    optional = {};
  }
  const claim = optional.claim || status.commerceOrder;
  const paid = { 2: "approved", 3: "rejected", 4: "cancelled" };
  return {
    id: "flow-" + status.flowOrder,
    status: paid[Number(status.status)] || "pending",
    currency_id: status.currency || "CLP",
    transaction_amount: status.amount,
    external_reference: `tienda:${optional.product}:${claim}:${optional.clp}`,
    payer: { email: status.payer || "" },
  };
}
