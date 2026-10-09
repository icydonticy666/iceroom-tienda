const RESERVATION_SECONDS = 15 * 60;
const PAYMENT_SECONDS = 24 * 60 * 60;

function db(env) {
  if (!env.PAYMENTS_DB) throw new Error("coupon-local-limit");
  return env.PAYMENTS_DB;
}

export async function limitedCouponAvailable(env, code, usageLimit, payhipUsage, now = Date.now()) {
  const remaining = Number(usageLimit) - Number(payhipUsage || 0);
  if (remaining <= 0) return false;
  const nowSeconds = Math.floor(now / 1000);
  const row = await db(env).prepare(
    "SELECT COUNT(*) AS n FROM coupon_reservations WHERE code = ? AND (state = 'approved' OR expires_at >= ?)"
  ).bind(code, nowSeconds).first();
  return Number(row?.n || 0) < remaining;
}

export async function reserveLimitedCoupon(env, quote, claim, now = Date.now()) {
  if (!quote?.usageLimit) return true;
  const database = db(env);
  const nowSeconds = Math.floor(now / 1000);
  const slots = Number(quote.usageLimit) - Number(quote.payhipUsage || 0);
  if (slots <= 0) return false;
  await database.prepare(
    "DELETE FROM coupon_reservations WHERE state = 'reserved' AND expires_at < ?"
  ).bind(nowSeconds).run();
  for (let slot = 1; slot <= slots; slot++) {
    const result = await database.prepare(
      "INSERT OR IGNORE INTO coupon_reservations (code, slot, claim, expires_at, state) VALUES (?, ?, ?, ?, 'reserved')"
    ).bind(quote.code, slot, claim, nowSeconds + RESERVATION_SECONDS).run();
    if (result.meta.changes === 1) return true;
  }
  return false;
}

export async function activateCouponReservation(env, intent, now = Date.now()) {
  if (!intent?.coupon_code) return true;
  const nowSeconds = Math.floor(now / 1000);
  const result = await db(env).prepare(
    "UPDATE coupon_reservations SET state = 'processing', expires_at = ? WHERE claim = ? AND state = 'reserved' AND expires_at >= ?"
  ).bind(nowSeconds + PAYMENT_SECONDS, intent.claim, nowSeconds).run();
  return result.meta.changes === 1;
}

export async function settleCouponReservation(env, claim, paymentState) {
  const state = String(paymentState || "");
  if (state === "rejected" || state === "cancelled") {
    await db(env).prepare("DELETE FROM coupon_reservations WHERE claim = ? AND state != 'approved'")
      .bind(claim).run();
    return;
  }
  const approved = state === "approved";
  const expires = approved ? 2147483647 : Math.floor(Date.now() / 1000) + PAYMENT_SECONDS;
  await db(env).prepare(
    "UPDATE coupon_reservations SET state = ?, expires_at = ? WHERE claim = ?"
  ).bind(approved ? "approved" : "pending", expires, claim).run();
}
