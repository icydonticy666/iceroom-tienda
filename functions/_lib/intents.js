import { PRODUCTS, priceOf, sellableInClp } from "./catalog.js";
import { couponQuote, normalizeCoupon } from "./discounts.js";
import { randomClaim } from "./http.js";
import { reserveLimitedCoupon, settleCouponReservation } from "./coupon-reservations.js";

export function requireDb(env) {
  if (!env.PAYMENTS_DB) throw new Error("payment-db-missing");
  return env.PAYMENTS_DB;
}

function clean(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function attributionFields(input = {}) {
  return {
    utmSource: clean(input.utmSource, 80),
    utmMedium: clean(input.utmMedium, 80),
    utmCampaign: clean(input.utmCampaign, 120),
    utmContent: clean(input.utmContent, 120),
    referrer: clean(input.referrer, 500),
    landingUrl: clean(input.landingUrl, 500),
    fbclid: clean(input.fbclid, 300),
    fbp: /^fb\.1\.\d+\.[A-Za-z0-9._-]+$/.test(clean(input.fbp, 300)) ? clean(input.fbp, 300) : "",
    fbc: /^fb\.1\.\d+\.[A-Za-z0-9._-]+$/.test(clean(input.fbc, 500)) ? clean(input.fbc, 500) : "",
    clientIp: clean(input.clientIp, 64),
    userAgent: clean(input.userAgent, 500),
  };
}

/** Precio vigente: si la promo tiene cupos (limit) y ya se usaron, vuelve al precio normal. */
export async function currentPrice(env, product) {
  const amount = priceOf(product);
  if (amount === product.clp || !product.promo?.limit) return amount;
  const row = await requireDb(env).prepare(
    "SELECT COUNT(*) AS n FROM payment_intents WHERE product_key = ? AND amount_clp = ? AND state = 'approved'"
  ).bind(product.key, amount).first();
  return Number(row?.n || 0) >= product.promo.limit ? product.clp : amount;
}

export async function createIntent(env, productKey, provider, email = "", rawCoupon = "", rawAttribution = {}) {
  const product = PRODUCTS[productKey];
  if (!sellableInClp(product) || !["mp", "flow"].includes(provider)) return null;
  const claim = randomClaim();
  const baseAmount = await currentPrice(env, product);
  const coupon = normalizeCoupon(rawCoupon);
  const quote = coupon ? await couponQuote(env, product, coupon, baseAmount) : null;
  const amount = quote ? quote.amount : baseAmount;
  const idempotencyKey = crypto.randomUUID();
  const tracking = attributionFields(rawAttribution);
  await requireDb(env).prepare(
    "INSERT INTO payment_intents (claim, provider, product_key, amount_clp, email, idempotency_key, coupon_code, utm_source, utm_medium, utm_campaign, utm_content, referrer, landing_url, fbclid, fbp, fbc, client_ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(claim, provider, product.key, amount, email || null, idempotencyKey, coupon || null,
    tracking.utmSource || null, tracking.utmMedium || null, tracking.utmCampaign || null,
    tracking.utmContent || null, tracking.referrer || null, tracking.landingUrl || null,
    tracking.fbclid || null, tracking.fbp || null, tracking.fbc || null,
    tracking.clientIp || null, tracking.userAgent || null).run();
  if (quote && !await reserveLimitedCoupon(env, quote, claim)) {
    await requireDb(env).prepare("DELETE FROM payment_intents WHERE claim = ?").bind(claim).run();
    throw new Error("coupon-limit");
  }
  return { claim, product, amount, idempotencyKey, coupon };
}

export async function getIntent(env, claim) {
  if (!/^[a-f0-9]{32}$/.test(String(claim || ""))) return null;
  return requireDb(env).prepare("SELECT * FROM payment_intents WHERE claim = ?")
    .bind(claim).first();
}

export async function setProviderOrder(env, claim, providerToken) {
  await requireDb(env).prepare(
    "UPDATE payment_intents SET provider_token = ?, state = 'pending' WHERE claim = ? AND state = 'created'"
  ).bind(providerToken, claim).run();
  await settleCouponReservation(env, claim, "pending");
}

export async function bindPayment(env, intent, paymentId, state) {
  if (!paymentId) return false;
  const result = await requireDb(env).prepare(
    "UPDATE payment_intents SET payment_id = COALESCE(payment_id, ?), state = CASE WHEN state IN ('refunded', 'charged_back') THEN state WHEN state = 'approved' AND ? NOT IN ('refunded', 'charged_back') THEN state ELSE ? END WHERE claim = ? AND (payment_id IS NULL OR payment_id = ?)"
  ).bind(String(paymentId), state, state, intent.claim, String(paymentId)).run();
  if (result.meta.changes === 1) await settleCouponReservation(env, intent.claim, state);
  return result.meta.changes === 1;
}

export function paymentMatchesIntent(payment, intent) {
  if (!intent) return false;
  const provider = String(payment?.id || "").startsWith("flow-") ? "flow" : "mp";
  return provider === intent.provider &&
    payment.external_reference === `tienda:${intent.product_key}:${intent.claim}:${intent.amount_clp}` &&
    payment.currency_id === "CLP" &&
    Number(payment.transaction_amount) === intent.amount_clp;
}
