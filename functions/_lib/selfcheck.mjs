import assert from "node:assert/strict";
import test from "node:test";
import { allowedPrices, amountOk, directOffer, parseRef, priceOf, PRODUCTS } from "./catalog.js";
import { createIntent } from "./intents.js";
import { couponCode } from "./coupon.js";
import { payhipOutcome, payerEmail } from "./fulfill.js";
import { flowAsPayment, flowSign } from "./flow.js";
import { mpSignatureOk } from "./signature.js";

test("el precio CLP es el mismo precio de lista en USD × 1.000 (sin promos automáticas)", () => {
  const studio = PRODUCTS.QLfl6;
  // Promo pública en pesos hasta el 18-oct 23:59 CL; después vuelve al precio de lista.
  assert.equal(priceOf(studio, new Date("2026-10-15T15:00:00.000Z")), 14990);
  assert.equal(priceOf(studio, new Date("2026-10-19T03:00:00.000Z")), 29990);
  // Lista, Cyber, promo pública, oferta Meta Chile y oferta Meta internacional.
  assert.deepEqual(allowedPrices(studio), [29990, 22492, 14990, 14990, 14990]);
  // Una promo debe vencer; `limit` es opcional para una venta flash sin stock artificial.
  for (const product of Object.values(PRODUCTS)) {
    if (product.promo) assert.ok(Date.parse(product.promo.until) && (!product.promo.limit || product.promo.limit > 0), product.key);
  }
});

test("la oferta Meta de Pritti Studio solo funciona con su enlace y vence con la campaña", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-12T18:00:00Z") });
  const studio = PRODUCTS.QLfl6;
  assert.equal(directOffer(studio, "meta-studio-1499", new Date("2026-10-12T18:00:00Z")).clp, 14990);
  assert.equal(directOffer(studio, "otro", new Date("2026-10-12T18:00:00Z")), null);
  assert.equal(directOffer(studio, "meta-studio-1499", new Date("2026-10-19T02:59:00Z")), null);
  assert.ok(allowedPrices(studio).includes(14990));
  let saved;
  const env = { PAYMENTS_DB: { prepare() { return { bind(...args) { saved = args; return { async run() {} }; } }; } } };
  const intent = await createIntent(env, "QLfl6", "mp", "", "", {}, "meta-studio-1499");
  assert.equal(intent.amount, 14990);
  assert.equal(saved[3], 14990);
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
