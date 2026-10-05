import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createIntent, getIntent, paymentMatchesIntent } from "./intents.js";
import { fulfill } from "./fulfill.js";
import { BUNDLE_COLLECTIONS } from "./catalog.js";
import { onRequestPost as cardPayment } from "../api/card-payment.js";
import { onRequestPost as flowCheckout } from "../api/flow-checkout.js";
import { onRequestPost as flowWebhook } from "../api/flow-webhook.js";
import { onRequestGet as checkoutStatus } from "../api/checkout-status.js";
import { onRequestGet as availableMethods } from "../api/methods.js";
import { onRequestPost as oldCheckout } from "../api/checkout.js";
import { onRequestPost as cardConfig } from "../api/card-config.js";
import { couponQuote, normalizeCoupon } from "./discounts.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../../schema.sql", import.meta.url), "utf8"));
  return {
    prepare(sql) {
      return {
        async first() { return sqlite.prepare(sql).get() || null; },
        bind(...args) {
          return {
            async first() { return sqlite.prepare(sql).get(...args) || null; },
            async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
          };
        },
      };
    },
    close() { sqlite.close(); },
  };
}

test("los métodos locales solo aparecen con D1 y el esquema aplicados", async () => {
  const env = { MP_PUBLIC_KEY: "public", MP_ACCESS_TOKEN: "secret", MP_WEBHOOK_SECRET: "secret",
    PAYHIP_API_KEY: "secret", ORDER_SECRET: "secret", FLOW_API_KEY: "key", FLOW_SECRET_KEY: "secret",
    PUBLIC_ORIGIN: "https://iceroom.example", CHECKOUT_MODE: "live", TEST_KEY: "clave-prueba" };
  const methodsRequest = new Request("https://iceroom.example/api/methods");
  const testRequest = new Request("https://iceroom.example/api/methods?prueba=clave-prueba");
  assert.deepEqual(await (await availableMethods({ request: methodsRequest, env })).json(), { card: false, flow: false });
  env.PAYMENTS_DB = { prepare() { throw new Error("schema missing"); } };
  assert.deepEqual(await (await availableMethods({ request: methodsRequest, env })).json(), { card: false, flow: false });
  env.PAYMENTS_DB = database();
  try {
    assert.deepEqual(await (await availableMethods({ request: methodsRequest, env })).json(), { card: true, flow: true });
    delete env.CHECKOUT_MODE;
    assert.deepEqual(await (await availableMethods({ request: methodsRequest, env })).json(), { card: false, flow: false });
    assert.deepEqual(await (await availableMethods({ request: testRequest, env })).json(), { card: true, flow: true });
    const wrongKey = new Request("https://iceroom.example/api/methods?prueba=1");
    assert.deepEqual(await (await availableMethods({ request: wrongKey, env })).json(), { card: false, flow: false });
    env.CHECKOUT_MODE = "live";
    env.PUBLIC_ORIGIN = "http://iceroom.example";
    assert.deepEqual(await (await availableMethods({ request: methodsRequest, env })).json(), { card: false, flow: false });
  } finally { env.PAYMENTS_DB.close(); }
  assert.equal((await oldCheckout()).status, 410);
});

function request(claim, formData, deviceId) {
  return new Request("https://iceroom.example/api/card-payment", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ claim, formData, deviceId }),
  });
}

// Forma real de window.MP_DEVICE_SESSION_ID (medida en la tienda el 30-sep-2026).
const DEVICE_REAL = "armor." + "a".repeat(192) + "." + "b".repeat(32);

test("un cupón de Payhip se valida y descuenta sobre el precio vigente al crear el checkout", async (t) => {
  // The flash sale has ended; intent amounts must use the regular price.
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-04T12:00:00.000Z") });
  const db = database();
  const env = { PAYMENTS_DB: db, PAYHIP_API_KEY: "payhip-secret" };
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/v2/coupons")) return Response.json({ data: { coupons: [{
      code: "VOCES20", coupon_type: "single", product_key: "0QEeV", percent_off: 20,
      amount_off: null, start_date: null, end_date: null, usage_limit: null,
    }] } });
    if (String(url).includes("/api/v1/coupons/verify")) return Response.json([{ code: "VOCES20", valid: "1", usage: "1" }]);
    throw new Error("unexpected fetch");
  };
  try {
    assert.equal(normalizeCoupon(" voces20 "), "VOCES20");
    const quote = await couponQuote(env, { key: "0QEeV", checkout: "b" }, "voces20", 9990);
    assert.deepEqual(quote, { code: "VOCES20", amount: 7992, discount: 1998, payhipUsage: 1 });
    const intent = await createIntent(env, "0QEeV", "mp", "", "voces20");
    assert.equal(intent.amount, 10392);
    assert.equal((await getIntent(env, intent.claim)).amount_clp, 10392);
  } finally { globalThis.fetch = previous; db.close(); }
});

test("el device ID real de MP (con puntos, ~230 caracteres) llega como X-meli-session-id", async () => {
  const db = database();
  const env = { PAYMENTS_DB: db, MP_ACCESS_TOKEN: "test-secret", MP_WEBHOOK_SECRET: "webhook-secret", PAYHIP_API_KEY: "payhip-secret", ORDER_SECRET: "order-secret", PUBLIC_ORIGIN: "https://iceroom.example" };
  const intent = await createIntent(env, "SQti3", "mp");
  const formData = { token: "abcdefgh1234", installments: 1, payment_method_id: "visa", payer: { email: "ana@example.com" } };
  const previous = globalThis.fetch;
  let header;
  globalThis.fetch = async (url, options) => {
    header = options.headers["X-meli-session-id"];
    const body = JSON.parse(options.body);
    return Response.json({ id: 22222, status: "approved", currency_id: "CLP",
      transaction_amount: intent.amount, external_reference: body.external_reference });
  };
  try {
    await cardPayment({ request: request(intent.claim, formData, DEVICE_REAL), env });
    assert.equal(header, DEVICE_REAL);
  } finally { globalThis.fetch = previous; db.close(); }
});

test("el cobro toma el monto de D1, usa idempotencia y bloquea el segundo submit", async () => {
  const db = database();
  const env = { PAYMENTS_DB: db, MP_ACCESS_TOKEN: "test-secret", MP_WEBHOOK_SECRET: "webhook-secret", PAYHIP_API_KEY: "payhip-secret", ORDER_SECRET: "order-secret", PUBLIC_ORIGIN: "https://iceroom.example" };
  const intent = await createIntent(env, "SQti3", "mp");
  const formData = { token: "abcdefgh1234", installments: 1, payment_method_id: "visa", payer: { email: "ana@example.com" }, transaction_amount: 1 };
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.mercadopago.com/v1/payments");
    assert.equal(options.headers["X-Idempotency-Key"], intent.idempotencyKey);
    const body = JSON.parse(options.body);
    assert.equal(body.transaction_amount, intent.amount);
    assert.equal(body.three_d_secure_mode, "optional");
    assert.equal(body.external_reference, `tienda:SQti3:${intent.claim}:${intent.amount}`);
    return Response.json({ id: 12345, status: "approved", currency_id: "CLP",
      transaction_amount: intent.amount, external_reference: body.external_reference });
  };
  try {
    const first = await cardPayment({ request: request(intent.claim, formData), env });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).url, `/gracias.html?claim=${intent.claim}`);
    assert.equal((await getIntent(env, intent.claim)).payment_id, "12345");
    const second = await cardPayment({ request: request(intent.claim, formData), env });
    assert.equal(second.status, 409);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; db.close(); }
});

test("3DS devuelve datos de desafío sin confirmar entrega", async () => {
  const db = database();
  const env = { PAYMENTS_DB: db, MP_ACCESS_TOKEN: "test-secret", MP_WEBHOOK_SECRET: "webhook-secret", PAYHIP_API_KEY: "payhip-secret", ORDER_SECRET: "order-secret", PUBLIC_ORIGIN: "https://iceroom.example" };
  const intent = await createIntent(env, "SQti3", "mp");
  const previous = globalThis.fetch;
  globalThis.fetch = async (_, options) => Response.json({
    id: 12346, status: "pending", status_detail: "pending_challenge", currency_id: "CLP",
    transaction_amount: intent.amount, external_reference: JSON.parse(options.body).external_reference,
    three_ds_info: { external_resource_url: "https://acs.example/challenge", creq: "challenge123" },
  });
  try {
    const response = await cardPayment({ request: request(intent.claim, {
      token: "abcdefgh1234", installments: 1, payment_method_id: "visa", payer: { email: "ana@example.com" },
    }), env });
    const body = await response.json();
    assert.equal(body.status, "pending_challenge");
    assert.equal(body.challenge.creq, "challenge123");
    assert.equal((await getIntent(env, intent.claim)).state, "pending");
  } finally { globalThis.fetch = previous; db.close(); }
});

test("solo el pago aprobado del intento crea un cupón y el reembolso queda para revisión", async () => {
  const db = database();
  const env = { PAYMENTS_DB: db, ORDER_SECRET: "order-secret", PAYHIP_API_KEY: "payhip-secret" };
  const intent = await createIntent(env, "SQti3", "mp");
  const payment = { id: 99999, status: "approved", currency_id: "CLP", transaction_amount: intent.amount,
    external_reference: `tienda:SQti3:${intent.claim}:${intent.amount}`, payer: { email: "ana@example.com" } };
  assert.equal(paymentMatchesIntent({ ...payment, transaction_amount: 1 }, await getIntent(env, intent.claim)), false);
  const previous = globalThis.fetch;
  let coupons = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://payhip.com/api/v2/coupons");
    assert.equal(options.headers["payhip-api-key"], "payhip-secret");
    coupons++;
    const fields = new URLSearchParams(options.body);
    return Response.json({ data: { id: 1, code: fields.get("code"), product_key: fields.get("product_key"),
      coupon_type: "single", percent_off: 100, usage_limit: 1, notes: fields.get("notes") } });
  };
  try {
    const first = await fulfill(env, payment, { claim: intent.claim });
    const again = await fulfill(env, payment, { claim: intent.claim });
    assert.equal(first.status, "approved");
    assert.equal(first.coupon, again.coupon);
    assert.equal(coupons, 1);
    const refund = await fulfill(env, { ...payment, status: "refunded" }, { claim: intent.claim });
    assert.equal(refund.status, "refunded");
    const row = await db.prepare("SELECT * FROM payment_fulfillments WHERE claim = ?").bind(intent.claim).first();
    assert.equal(row.refund_action_required, 1);
    const lateApproved = await fulfill(env, payment, { claim: intent.claim });
    assert.equal(lateApproved.status, "refunded");
  } finally { globalThis.fetch = previous; db.close(); }
});

test("un reembolso durante la creación del cupón no vuelve a aprobar la entrega", async () => {
  const db = database();
  const env = { PAYMENTS_DB: db, ORDER_SECRET: "order-secret", PAYHIP_API_KEY: "payhip-secret" };
  const intent = await createIntent(env, "SQti3", "mp");
  const payment = { id: 77777, status: "approved", currency_id: "CLP", transaction_amount: intent.amount,
    external_reference: `tienda:SQti3:${intent.claim}:${intent.amount}` };
  const previous = globalThis.fetch;
  let release;
  let started;
  const reachedPayhip = new Promise((resolve) => { started = resolve; });
  const responseReady = new Promise((resolve) => { release = resolve; });
  globalThis.fetch = async (_, options) => {
    const form = new URLSearchParams(options.body);
    started();
    await responseReady;
    return Response.json({ data: { code: form.get("code"), product_key: "SQti3", coupon_type: "single",
      percent_off: 100, usage_limit: 1, notes: form.get("notes") } });
  };
  try {
    const approval = fulfill(env, payment, { claim: intent.claim });
    await reachedPayhip;
    const refund = await fulfill(env, { ...payment, status: "refunded" }, { claim: intent.claim });
    assert.equal(refund.status, "refunded");
    release();
    assert.equal((await approval).status, "refunded");
    const row = await db.prepare("SELECT * FROM payment_fulfillments WHERE claim = ?").bind(intent.claim).first();
    assert.equal(row.state, "refunded");
    assert.equal(row.refund_action_required, 1);
  } finally { globalThis.fetch = previous; release?.(); db.close(); }
});

test("Payhip duplicado se acepta solo si el cupón existente coincide con la compra", async () => {
  const db = database();
  const env = { PAYMENTS_DB: db, ORDER_SECRET: "order-secret", PAYHIP_API_KEY: "payhip-secret" };
  const intent = await createIntent(env, "SQti3", "mp");
  const payment = { id: 88888, status: "approved", currency_id: "CLP", transaction_amount: intent.amount,
    external_reference: `tienda:SQti3:${intent.claim}:${intent.amount}` };
  const previous = globalThis.fetch;
  let code;
  let valid = false;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") {
      code = new URLSearchParams(options.body).get("code");
      return new Response("code already exists", { status: 409 });
    }
    assert.match(String(url), /\/api\/v2\/coupons\?limit=100&offset=0$/);
    return Response.json({ data: { coupons: [{ code, product_key: "SQti3", coupon_type: "single",
      percent_off: 100, usage_limit: 1, notes: valid ? "Pago 88888" : "Pago ajeno" }] } });
  };
  try {
    await assert.rejects(fulfill(env, payment, { claim: intent.claim }), /payhip-error/);
    valid = true;
    assert.equal((await fulfill(env, payment, { claim: intent.claim })).status, "approved");
  } finally { globalThis.fetch = previous; db.close(); }
});

test("Flow guarda su token, valida el callback y entrega una sola vez", async t => {
  // This fixture uses the regular price; campaign amounts have their own tests.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-01T12:00:00Z') });
  const db = database();
  const env = { PAYMENTS_DB: db, FLOW_API_KEY: "flow-public", FLOW_SECRET_KEY: "flow-secret",
    FLOW_SANDBOX: "1", PUBLIC_ORIGIN: "https://iceroom.example", ORDER_SECRET: "order-secret", PAYHIP_API_KEY: "payhip-secret" };
  const previous = globalThis.fetch;
  let created = 0;
  let couponCalls = 0;
  let claim = "";
  globalThis.fetch = async (url, options) => {
    if (url === "https://sandbox.flow.cl/api/payment/create") {
      const form = new URLSearchParams(options.body);
      claim = form.get("commerceOrder");
      assert.equal(form.get("amount"), "4990");
      assert.equal(form.get("urlConfirmation"), "https://iceroom.example/api/flow-webhook");
      created++;
      return Response.json({ url: "https://sandbox.flow.cl/checkout", token: "flow-token", flowOrder: 44 });
    }
    if (String(url).startsWith("https://sandbox.flow.cl/api/payment/getStatus?")) {
      return Response.json({ flowOrder: 44, status: 2, currency: "CLP", amount: 4990,
        commerceOrder: claim, payer: "ana@example.com",
        optional: JSON.stringify({ product: "SQti3", clp: 4990, claim }) });
    }
    if (url === "https://payhip.com/api/v2/coupons") {
      couponCalls++;
      const form = new URLSearchParams(options.body);
      return Response.json({ data: { code: form.get("code"), product_key: "SQti3",
        coupon_type: "single", percent_off: 100, usage_limit: 1, notes: form.get("notes") } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const request = new Request("https://iceroom.example/api/flow-checkout", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ product: "SQti3", email: "ana@example.com" }) });
    const response = await flowCheckout({ request, env });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).url, "https://sandbox.flow.cl/checkout?token=flow-token");
    assert.equal(created, 1);
    assert.equal((await getIntent(env, claim)).provider_token, "flow-token");
    const callback = () => new Request("https://iceroom.example/api/flow-webhook", { method: "POST",
      body: new URLSearchParams({ token: "flow-token" }) });
    assert.equal((await flowWebhook({ request: callback(), env })).status, 200);
    assert.equal((await flowWebhook({ request: callback(), env })).status, 200);
    assert.equal(couponCalls, 1);
  } finally { globalThis.fetch = previous; db.close(); }
});

test("un timeout de tarjeta se recupera buscando el pago por referencia", async () => {
  const db = database();
  const env = { PAYMENTS_DB: db, MP_ACCESS_TOKEN: "mp-secret", PAYHIP_API_KEY: "payhip-secret", ORDER_SECRET: "order-secret" };
  const intent = await createIntent(env, "SQti3", "mp");
  await db.prepare("UPDATE payment_intents SET state = 'processing' WHERE claim = ?").bind(intent.claim).run();
  const payment = { id: 808080, status: "approved", currency_id: "CLP", transaction_amount: intent.amount,
    external_reference: `tienda:SQti3:${intent.claim}:${intent.amount}`, payer: { email: "ana@example.com" } };
  const previous = globalThis.fetch;
  let searches = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("https://api.mercadopago.com/v1/payments/search?")) {
      searches++;
      assert.equal(url.searchParams.get("external_reference"), payment.external_reference);
      return Response.json({ results: [payment] });
    }
    if (url === "https://api.mercadopago.com/v1/payments/808080") return Response.json(payment);
    if (url === "https://payhip.com/api/v2/coupons") {
      const form = new URLSearchParams(options.body);
      return Response.json({ data: { code: form.get("code"), product_key: "SQti3",
        coupon_type: "single", percent_off: 100, usage_limit: 1, notes: form.get("notes") } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const request = new Request(`https://iceroom.example/api/checkout-status?claim=${intent.claim}`);
    const response = await checkoutStatus({ request, env });
    assert.equal((await response.json()).status, "approved");
    assert.equal((await getIntent(env, intent.claim)).payment_id, "808080");
    assert.equal(searches, 1);
  } finally { globalThis.fetch = previous; db.close(); }
});

test("el producto de prueba solo se vende con la clave TEST_KEY y entrega el producto real", async () => {
  const env = { MP_PUBLIC_KEY: "public", MP_ACCESS_TOKEN: "secret", MP_WEBHOOK_SECRET: "secret",
    PAYHIP_API_KEY: "secret", ORDER_SECRET: "secret", FLOW_API_KEY: "key", FLOW_SECRET_KEY: "secret",
    PUBLIC_ORIGIN: "https://iceroom.example", TEST_KEY: "clave-prueba", PAYMENTS_DB: database() };
  const post = (body) => new Request("https://iceroom.example/api/x", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await cardConfig({ request: post({ product: "PRUEBA350" }), env })).status, 400);
    assert.equal((await cardConfig({ request: post({ product: "PRUEBA350", prueba: "otra" }), env })).status, 400);
    assert.equal((await flowCheckout({ request: post({ product: "PRUEBA350", email: "a@b.cl" }), env })).status, 400);
    const ok = await (await cardConfig({ request: post({ product: "PRUEBA350", prueba: "clave-prueba" }), env })).json();
    assert.equal(ok.amount, 350);
    const { PRODUCTS, payhipKey, redeemUrl } = await import("./catalog.js");
    assert.equal(payhipKey(PRODUCTS.PRUEBA350), "34vZU");
    assert.equal(redeemUrl(PRODUCTS.PRUEBA350), "https://payhip.com/buy?link=34vZU");
  } finally { env.PAYMENTS_DB.close(); }
});
test("un bundle sin colección de entrega no se cobra en pesos", async () => {
  const db = database();
  const env = { PAYMENTS_DB: db, ORDER_SECRET: "order-secret", PAYHIP_API_KEY: "payhip-secret" };
  const anterior = BUNDLE_COLLECTIONS.IiHTG;
  BUNDLE_COLLECTIONS.IiHTG = "";
  try {
    assert.equal(await createIntent(env, "IiHTG", "flow"), null);
    assert.equal(await createIntent(env, "IiHTG", "mp"), null);
    assert.ok(await createIntent(env, "SQti3", "flow"));      // los productos sueltos siguen
  } finally { BUNDLE_COLLECTIONS.IiHTG = anterior; db.close(); }
});

test("el cupón de un bundle va por su colección (un cupón single de la API no sirve en bundles)", async () => {
  const db = database();
  const env = { PAYMENTS_DB: db, ORDER_SECRET: "order-secret", PAYHIP_API_KEY: "payhip-secret" };
  const anterior = BUNDLE_COLLECTIONS.IiHTG;
  BUNDLE_COLLECTIONS.IiHTG = "colUltimate";
  const intent = await createIntent(env, "IiHTG", "flow");
  const payment = { id: "flow-1", status: "approved", currency_id: "CLP", transaction_amount: intent.amount,
    external_reference: `tienda:IiHTG:${intent.claim}:${intent.amount}` };
  const previous = globalThis.fetch;
  let enviado;
  globalThis.fetch = async (url, options) => {
    enviado = new URLSearchParams(options.body);
    return Response.json({ data: { code: enviado.get("code"), coupon_type: "collection", collection_id: "colUltimate",
      product_key: null, percent_off: 100, usage_limit: 1, notes: enviado.get("notes") } });
  };
  try {
    const result = await fulfill(env, payment, { claim: intent.claim });
    assert.equal(result.status, "approved");
    assert.equal(enviado.get("coupon_type"), "collection");
    assert.equal(enviado.get("collection_id"), "colUltimate");
    assert.equal(enviado.get("product_key"), null);
    assert.equal(result.redeemUrl, "https://payhip.com/buy?link=IiHTG");
  } finally { BUNDLE_COLLECTIONS.IiHTG = anterior; globalThis.fetch = previous; db.close(); }
});
