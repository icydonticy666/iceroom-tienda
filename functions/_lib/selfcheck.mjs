import assert from "node:assert/strict";
import test from "node:test";
import { allowedPrices, amountOk, parseRef, priceOf, PRODUCTS } from "./catalog.js";
import { couponCode } from "./coupon.js";
import { payhipOutcome, payerEmail } from "./fulfill.js";
import { flowAsPayment, flowSign } from "./flow.js";
import { mpSignatureOk } from "./signature.js";

test("el precio CLP es el mismo precio de lista en USD × 1.000 (sin promos automáticas)", () => {
  const studio = PRODUCTS.QLfl6;
  assert.equal(priceOf(studio, new Date("2026-09-24T15:00:00.000Z")), 29990);
  assert.deepEqual(allowedPrices(studio), [29990]);
  // Una promo debe vencer; `limit` es opcional para una venta flash sin stock artificial.
  for (const product of Object.values(PRODUCTS)) {
    if (product.promo) assert.ok(Date.parse(product.promo.until) && (!product.promo.limit || product.promo.limit > 0), product.key);
  }
});

test("la referencia del pago solo acepta productos del catálogo", () => {
  const claim = "a".repeat(32);
  assert.equal(parseRef(`tienda:0QEeV:${claim}:12990`).productKey, "0QEeV");
  assert.equal(parseRef(`tienda:nope:${claim}:12990`), null);
  assert.equal(parseRef("MP123"), null);
});

test("el monto tiene que ser CLP exacto", () => {
  assert.equal(amountOk({ currency_id: "CLP", transaction_amount: 12990 }, 12990), true);
  assert.equal(amountOk({ currency_id: "CLP", transaction_amount: 100 }, 12990), false);
  assert.equal(amountOk({ currency_id: "USD", transaction_amount: 12990 }, 12990), false);
});

test("el cupón no revela el id del pago y se repite para el mismo pago", async () => {
  const a = await couponCode("secreto", "99887766");
  const b = await couponCode("secreto", "99887766");
  const c = await couponCode("otro", "99887766");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.startsWith("CL"), true);
  assert.equal(a.includes("99887766"), false);
});

test("Payhip duplicado cuenta como cupón ya creado", () => {
  assert.equal(payhipOutcome(200, "{}"), "created");
  assert.equal(payhipOutcome(400, "code already exists"), "exists");
  assert.equal(payhipOutcome(500, "code already exists"), "error");
  assert.equal(payhipOutcome(401, "unauthorized"), "auth");
  assert.equal(payhipOutcome(500, "nope"), "error");
});

test("un correo tapado de Mercado Pago no se usa", () => {
  assert.equal(payerEmail({ payer: { email: "xxxx@gmail.com" } }), "");
  assert.equal(payerEmail({ payer: { email: "ana@gmail.com" } }), "ana@gmail.com");
});

test("Flow firma los parámetros y un pago status 2 queda aprobado", async () => {
  const signature = await flowSign("secret", { amount: "4990", apiKey: "abc" });
  const again = await flowSign("secret", { apiKey: "abc", amount: "4990" });
  assert.equal(signature, again);
  assert.equal(signature.length, 64);
  const payment = flowAsPayment({
    flowOrder: 99,
    status: 2,
    currency: "CLP",
    amount: 4990,
    commerceOrder: "a".repeat(32),
    payer: "ana@gmail.com",
    optional: JSON.stringify({ product: "SQti3", clp: 4990, claim: "a".repeat(32) }),
  });
  assert.equal(payment.status, "approved");
  assert.equal(payment.external_reference, `tienda:SQti3:${"a".repeat(32)}:4990`);
});

test("la firma de Mercado Pago coincide con el manifiesto", async () => {
  const secret = "webhook-secret";
  const manifest = "id:999;request-id:req-1;ts:1700000000;";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const v1 = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const header = `ts=1700000000,v1=${v1}`;
  assert.equal(await mpSignatureOk({ secret, dataId: "999", requestId: "req-1", signatureHeader: header }), true);
  assert.equal(await mpSignatureOk({ secret, dataId: "1000", requestId: "req-1", signatureHeader: header }), false);
  assert.equal(await mpSignatureOk({ secret: "", dataId: "", requestId: "", signatureHeader: "" }), false);
});
