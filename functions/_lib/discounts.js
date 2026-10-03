import { bundleCollection, payhipKey, PRODUCT_COLLECTIONS } from "./catalog.js";

export function normalizeCoupon(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9_-]{2,40}$/.test(code) ? code : "";
}

function unwrapLegacy(data) {
  if (Array.isArray(data)) return data[0] || null;
  if (Array.isArray(data?.data)) return data.data[0] || null;
  return data?.data || data || null;
}

function couponScopeOk(coupon, product) {
  if (coupon.coupon_type === "multi") return true;
  if (coupon.coupon_type === "single") return coupon.product_key === payhipKey(product);
  if (coupon.coupon_type === "collection") {
    return (PRODUCT_COLLECTIONS[payhipKey(product)] || []).includes(coupon.collection_id) ||
      bundleCollection(product) === coupon.collection_id;
  }
  return false;
}

function dateOk(coupon, now) {
  const start = coupon.start_date && Date.parse(coupon.start_date);
  const end = coupon.end_date && Date.parse(coupon.end_date);
  return (!start || now >= start) && (!end || now <= end);
}

async function findCoupon(env, code) {
  for (let offset = 0; offset < 500; offset += 100) {
    const response = await fetch(`https://payhip.com/api/v2/coupons?limit=100&offset=${offset}`, {
      headers: { "payhip-api-key": env.PAYHIP_API_KEY },
    });
    if (!response.ok) throw new Error("coupon-service");
    const coupons = (await response.json())?.data?.coupons;
    if (!Array.isArray(coupons)) throw new Error("coupon-service");
    const found = coupons.find((coupon) => normalizeCoupon(coupon.code) === code);
    if (found) return found;
    if (coupons.length < 100) break;
  }
  return null;
}

async function legacyStatus(env, code) {
  const response = await fetch(`https://payhip.com/api/v1/coupons/verify?code=${encodeURIComponent(code)}`, {
    headers: { "payhip-api-key": env.PAYHIP_API_KEY },
  });
  if (!response.ok) return { valid: false, usage: 0 };
  const coupon = unwrapLegacy(await response.json().catch(() => null));
  if (!coupon) return { valid: false, usage: 0 };
  const explicit = coupon.valid;
  const valid = explicit == null || ![false, 0, "0", "false", "invalid"].includes(explicit);
  return { valid, usage: Number(coupon.usage || 0) };
}

export async function couponQuote(env, product, rawCode, baseAmount, now = Date.now()) {
  const code = normalizeCoupon(rawCode);
  if (!code) throw new Error("coupon-invalid");
  if (!env.PAYHIP_API_KEY) throw new Error("coupon-service");
  const [coupon, legacy] = await Promise.all([findCoupon(env, code), legacyStatus(env, code)]);
  if (!coupon || !legacy.valid || !couponScopeOk(coupon, product) || !dateOk(coupon, now)) {
    throw new Error("coupon-invalid");
  }

  // Payhip no expone un contador transaccional compartido con cobros externos.
  // Para no exceder cupos, los cupones con límite se conservan solo en PayPal.
  if (coupon.usage_limit) throw new Error("coupon-local-limit");

  const minimum = Number(coupon.minimum_purchase_amount || 0) * 10;
  if (minimum && baseAmount < minimum) throw new Error("coupon-minimum");
  let amount = baseAmount;
  if (Number(coupon.percent_off) > 0) amount = Math.round(baseAmount * (1 - Number(coupon.percent_off) / 100));
  else if (Number(coupon.amount_off) > 0) amount = baseAmount - Number(coupon.amount_off) * 10;
  else throw new Error("coupon-invalid");
  if (amount < 350) throw new Error("coupon-local-minimum");
  return { code, amount, discount: baseAmount - amount, payhipUsage: legacy.usage };
}
