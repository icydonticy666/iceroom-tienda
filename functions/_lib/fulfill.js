import { PRODUCTS, allowedPrices, amountOk, bundleCollection, formatClp, isBundle, parseRef, payhipKey, redeemUrl } from "./catalog.js";
import { couponCode } from "./coupon.js";
import { bindPayment, getIntent, paymentMatchesIntent } from "./intents.js";

export function payhipOutcome(status, text) {
  if (status >= 200 && status < 300) return "created";
  if (status === 401 || status === 403) return "auth";
  if (status === 400 || status === 409 || status === 422) {
    if (/already|exist|duplicate|taken|in use|unique/i.test(text || "")) return "exists";
  }
  return "error";
}

function couponMatches(coupon, product, code, paymentId) {
  const collection = isBundle(product) ? bundleCollection(product) : "";
  const scope = collection
    ? coupon?.coupon_type === "collection" && coupon?.collection_id === collection
    : coupon?.coupon_type === "single" && coupon?.product_key === payhipKey(product);
  return coupon?.code === code && scope && Number(coupon?.percent_off) === 100 &&
    Number(coupon?.usage_limit) === 1 && coupon?.notes === `Pago ${paymentId}`;
}

async function existingCoupon(env, product, code, paymentId) {
  // Payhip no permite buscar por código; solo ofrece una lista paginada.
  for (let offset = 0; offset < 10000; offset += 100) {
    const res = await fetch(`https://payhip.com/api/v2/coupons?limit=100&offset=${offset}`, {
      headers: { "payhip-api-key": env.PAYHIP_API_KEY },
    });
    if (!res.ok) throw new Error("payhip-coupon-lookup");
    const coupons = (await res.json())?.data?.coupons;
    if (!Array.isArray(coupons)) throw new Error("payhip-invalid-coupon-list");
    const found = coupons.find((coupon) => coupon.code === code);
    if (found) return couponMatches(found, product, code, paymentId);
    if (coupons.length < 100) return false;
  }
  return false;
}

export function payerEmail(payment) {
  const candidates = [payment?.payer?.email, payment?.additional_info?.payer?.email];
  for (const raw of candidates) {
    const email = String(raw || "").trim().toLowerCase();
    const local = email.split("@")[0] || "";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/^x+$/.test(local)) return email;
  }
  return "";
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function kvGet(env, key) {
  if (!env.ORDERS) return null;
  const raw = await env.ORDERS.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function kvPut(env, key, value) {
  if (!env.ORDERS) return;
  await env.ORDERS.put(key, JSON.stringify(value));
}

async function createCoupon(env, product, code, paymentId) {
  // Los bundles van por su colección: un cupón `single` de la API no se aplica a un bundle.
  const collection = isBundle(product) ? bundleCollection(product) : "";
  if (isBundle(product) && !collection) throw new Error("payhip-bundle-sin-coleccion");
  const scope = collection
    ? { coupon_type: "collection", collection_id: collection }
    : { coupon_type: "single", product_key: payhipKey(product) };
  const body = new URLSearchParams({
    code,
    ...scope,
    percent_off: "100",
    usage_limit: "1",
    notes: `Pago ${paymentId}`,
  });
  const res = await fetch("https://payhip.com/api/v2/coupons", {
    method: "POST",
    headers: {
      "payhip-api-key": env.PAYHIP_API_KEY,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await res.text();
  const outcome = payhipOutcome(res.status, text);
  if (outcome === "created") {
    let coupon;
    try { coupon = JSON.parse(text)?.data; } catch { /* respuesta inválida */ }
    if (couponMatches(coupon, product, code, paymentId)) {
      return outcome;
    }
    throw new Error("payhip-invalid-coupon");
  }
  if (outcome === "exists" && await existingCoupon(env, product, code, paymentId)) return outcome;
  const error = new Error(outcome === "auth" ? "payhip-auth" : "payhip-error");
  error.detail = text.slice(0, 300);
  throw error;
}

async function sendEmail(env, { to, product, code, url, clp }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !to) return false;
  const steps = `1. Abre el enlace.\n2. Toca "Add coupon" y pega el código ${code}. El total queda en US$0.\n3. Escribe tu correo y confirma.`;
  const download = product.kind === "service"
    ? `${steps}\n\nDespués escríbeme por Instagram @iceroomcl para coordinar la mezcla.`
    : `${steps}\n\nPayhip te muestra la descarga al tiro y te la manda a tu correo.`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject: `Tu compra en iceroom — ${product.name}`,
      text: `Pago aprobado por ${formatClp(clp)} CLP.\n\nTu código de descarga (un solo uso): ${code}\n${url}\n\n${download}\n`,
    }),
  });
  return res.ok;
}

async function sendCapi(env, { payment, product, clp, email, origin, ip, ua }) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN || product.testOnly) return false;
  const userData = {};
  if (email) userData.em = [await sha256(email)];
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua;
  const payload = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: `mp-${payment.id}`,
      action_source: "website",
      event_source_url: `${origin}/gracias.html`,
      user_data: userData,
      custom_data: {
        currency: "CLP",
        value: clp,
        content_ids: [product.key],
        content_name: product.name,
        content_type: "product",
      },
    }],
  };
  if (env.META_TEST_CODE) payload.test_event_code = env.META_TEST_CODE;
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
  );
  return res.ok;
}

function view(product, record) {
  return {
    status: record.refunded ? "refunded" : "approved",
    name: product.name,
    kind: product.kind,
    clp: record.clp,
    coupon: record.refunded ? "" : record.code,
    redeemUrl: record.refunded ? "" : redeemUrl(product, record.code),
    emailSent: Boolean(record.emailSent),
  };
}

export async function getPayment(env, id) {
  if (!/^\d{1,20}$/.test(String(id || ""))) return null;
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const error = new Error("mp-" + res.status);
    throw error;
  }
  return res.json();
}

/**
 * Verifica el pago contra Mercado Pago y crea el cupón una sola vez.
 * extras.claim es obligatorio cuando llama el navegador.
 */
export async function fulfill(env, payment, extras = {}) {
  const ref = parseRef(payment?.external_reference);
  if (!ref) return { ignore: true };
  if (extras.claim && extras.claim !== ref.claim) return { error: "claim", status: 404 };

  const product = PRODUCTS[ref.productKey];
  const intent = env.PAYMENTS_DB ? await getIntent(env, ref.claim) : null;
  if (intent && !paymentMatchesIntent(payment, intent)) {
    return { error: "El pago no corresponde a este pedido.", status: 409 };
  }
  if (!intent && (!allowedPrices(product).includes(ref.clp) || !amountOk(payment, ref.clp))) {
    return { error: "El monto del pago no coincide con el producto.", status: 409 };
  }

  const id = String(payment.id);
  if (intent) {
    if (!await bindPayment(env, intent, id, payment.status)) {
      return { error: "Ese pedido ya está asociado a otro pago.", status: 409 };
    }
    return fulfillWithDb(env, payment, extras, intent, product, ref);
  }
  const kvKey = `pay:${id}`;
  const record = (await kvGet(env, kvKey)) || {
    code: "",
    product: product.key,
    claim: ref.claim,
    clp: ref.clp,
    status: "new",
    emailSent: false,
    capiSent: false,
    refunded: false,
  };

  if (payment.status === "refunded" || payment.status === "charged_back") {
    record.refunded = true;
    record.refundActionRequired = Boolean(record.code);
    record.status = "refunded";
    await kvPut(env, kvKey, record);
    return { status: "refunded", name: product.name, kind: product.kind, clp: ref.clp, coupon: "", redeemUrl: "" };
  }

  if (payment.status !== "approved") {
    const rejected = payment.status === "rejected" || payment.status === "cancelled";
    return {
      status: rejected ? "rejected" : "pending",
      name: product.name,
      kind: product.kind,
      clp: ref.clp,
      coupon: "",
      redeemUrl: "",
    };
  }

  if (!env.PAYHIP_API_KEY) return { error: "Falta la API key de Payhip.", status: 503 };

  if (record.status !== "ready") {
    const secret = env.ORDER_SECRET || env.MP_ACCESS_TOKEN || env.FLOW_SECRET_KEY;
    if (!secret) return { error: "Falta una clave para armar el cupón.", status: 503 };
    record.code = record.code || await couponCode(secret, id);
    await createCoupon(env, product, record.code, id);
    record.status = "ready";
    await kvPut(env, kvKey, record);
  }

  const email = payerEmail(payment);
  if (env.ORDERS && !record.emailSent) {
    record.emailSent = await sendEmail(env, {
      to: email,
      product,
      code: record.code,
      url: redeemUrl(product, record.code),
      clp: ref.clp,
    });
    if (record.emailSent) await kvPut(env, kvKey, record);
  }
  if (env.ORDERS && !record.capiSent) {
    record.capiSent = await sendCapi(env, {
      payment,
      product,
      clp: ref.clp,
      email,
      origin: extras.origin || "https://iceroom.cl",
      ip: extras.ip || "",
      ua: extras.ua || "",
    });
    if (record.capiSent) await kvPut(env, kvKey, record);
  }

  return view(product, record);
}

async function fulfillWithDb(env, payment, extras, intent, product, ref) {
  const id = String(payment.id);
  const db = env.PAYMENTS_DB;
  const row = await db.prepare("SELECT * FROM payment_fulfillments WHERE claim = ?")
    .bind(intent.claim).first();
  if (payment.status === "refunded" || payment.status === "charged_back") {
    await db.prepare(
      "INSERT OR IGNORE INTO payment_fulfillments (payment_id, claim, code, state, refunded) VALUES (?, ?, '', 'refunded', 1)"
    ).bind(id, intent.claim).run();
    await db.prepare("UPDATE payment_fulfillments SET refunded = 1, state = 'refunded', refund_action_required = CASE WHEN code != '' THEN 1 ELSE 0 END WHERE claim = ?")
      .bind(intent.claim).run();
    return { status: "refunded", name: product.name, kind: product.kind, clp: ref.clp, coupon: "", redeemUrl: "" };
  }
  if (payment.status !== "approved") {
    const rejected = payment.status === "rejected" || payment.status === "cancelled";
    return { status: rejected ? "rejected" : "pending", name: product.name, kind: product.kind,
      clp: ref.clp, coupon: "", redeemUrl: "" };
  }
  if (intent.state === "refunded" || intent.state === "charged_back") {
    return { status: "refunded", name: product.name, kind: product.kind, clp: ref.clp, coupon: "", redeemUrl: "" };
  }
  if (!env.PAYHIP_API_KEY || !env.ORDER_SECRET) {
    return { error: "Entrega de pagos no configurada.", status: 503 };
  }
  const code = await couponCode(env.ORDER_SECRET, id);
  await db.prepare(
    "INSERT OR IGNORE INTO payment_fulfillments (payment_id, claim, code, state) VALUES (?, ?, ?, 'retry')"
  ).bind(id, intent.claim, code).run();
  const saved = await db.prepare("SELECT * FROM payment_fulfillments WHERE claim = ?")
    .bind(intent.claim).first();
  if (!saved || saved.payment_id !== id) return { error: "Pedido duplicado.", status: 409 };
  if (saved.refunded) return { status: "refunded", name: product.name, kind: product.kind,
    clp: ref.clp, coupon: "", redeemUrl: "" };
  if (saved.state !== "ready") {
    const lease = Math.floor(Date.now() / 1000) + 45;
    const acquired = await db.prepare(
      "UPDATE payment_fulfillments SET state = 'processing', lease_until = ? WHERE payment_id = ? AND state != 'ready' AND lease_until < ?"
    ).bind(lease, id, Math.floor(Date.now() / 1000)).run();
    if (acquired.meta.changes !== 1) {
      return { status: "pending", name: product.name, kind: product.kind, clp: ref.clp, coupon: "", redeemUrl: "" };
    }
    try {
      await createCoupon(env, product, code, id);
      await db.prepare("UPDATE payment_fulfillments SET state = 'ready', lease_until = 0 WHERE payment_id = ? AND refunded = 0 AND state = 'processing'")
        .bind(id).run();
    } catch (error) {
      await db.prepare("UPDATE payment_fulfillments SET state = 'retry', lease_until = 0 WHERE payment_id = ? AND refunded = 0")
        .bind(id).run();
      throw error;
    }
  }
  const fresh = await db.prepare("SELECT * FROM payment_fulfillments WHERE payment_id = ?").bind(id).first();
  if (fresh.refunded) return { status: "refunded", name: product.name, kind: product.kind,
    clp: ref.clp, coupon: "", redeemUrl: "" };
  if (fresh.state !== "ready") return { status: "pending", name: product.name, kind: product.kind,
    clp: ref.clp, coupon: "", redeemUrl: "" };
  const email = payerEmail(payment) || intent.email || "";
  let emailSent = Boolean(fresh.email_sent);
  if (!emailSent && await sendEmail(env, { to: email, product, code, url: redeemUrl(product, code), clp: ref.clp })) {
    await db.prepare("UPDATE payment_fulfillments SET email_sent = 1 WHERE payment_id = ?").bind(id).run();
    emailSent = true;
  }
  if (!fresh.capi_sent && await sendCapi(env, { payment, product, clp: ref.clp, email,
    origin: extras.origin || "https://iceroom.cl", ip: extras.ip || "", ua: extras.ua || "" })) {
    await db.prepare("UPDATE payment_fulfillments SET capi_sent = 1 WHERE payment_id = ?").bind(id).run();
  }
  return { status: "approved", name: product.name, kind: product.kind, clp: ref.clp,
    coupon: code, redeemUrl: redeemUrl(product, code), emailSent };
}
