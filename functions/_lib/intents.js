import { PRODUCTS, priceOf, sellableInClp } from "./catalog.js";
import { couponQuote, normalizeCoupon } from "./discounts.js";
import { randomClaim } from "./http.js";
import { reserveLimitedCoupon, settleCouponReservation } from "./coupon-reservations.js";

export function requireDb(env) {
  if (!env.PAYMENTS_DB) throw new Error("payment-db-missing");
  return env.PAYMENTS_DB;
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

export async function createIntent(env, productKey, provider, email = "", rawCoupon = "") {
  const product = PRODUCTS[productKey];
  if (!sellableInClp(product) || !["mp", "flow"].includes(provider)) return null;
  const claim = randomClaim();
  const baseAmount = await currentPrice(env, product);
  const coupon = normalizeCoupon(rawCoupon);
  const quote = coupon ? await couponQuote(env, product, coupon, baseAmount) : null;
  const amount = quote ? quote.amount : baseAmount;
  const idempotencyKey = crypto.randomUUID();
  await requireDb(env).prepare(
    "INSERT INTO payment_intents (claim, provider, product_key, amount_clp, email, idempotency_key, coupon_code) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(claim, provider, product.key, amount, email || null, idempotencyKey, coupon || null).run();
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
