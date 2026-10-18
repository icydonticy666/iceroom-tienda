import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCTS, directOffer } from "./catalog.js";
import { currentPrice } from "./intents.js";
import { onRequestGet as paypalCheckout } from "../api/paypal-checkout.js";

const studio = PRODUCTS.QLfl6;
const intlUrl = "https://payhip.com/order?link=INTL1499";

test("la oferta internacional cobra $14.990 en pesos y vence el 25-oct 23:59 CL", async () => {
  assert.equal(directOffer(studio, "meta-studio-intl", new Date("2026-10-20T12:00:00Z")).usd, 1499);
  assert.equal(directOffer(studio, "meta-studio-intl", new Date("2026-10-26T02:59:00Z")), null);
  assert.equal(directOffer(PRODUCTS["0QEeV"], "meta-studio-intl"), null);
  assert.equal(await currentPrice({}, studio, "meta-studio-intl"), 14990);
});

test("PayPal con la oferta internacional va al bundle de US$14.99; sin oferta, al precio normal", () => {
  const go = (query, env) => paypalCheckout({ request: new Request("https://iceroom.cl/api/paypal-checkout?" + query), env })
    .headers.get("location");
  assert.equal(go("product=QLfl6&offer=meta-studio-intl", { INTL_STUDIO_PAYPAL_URL: intlUrl }), intlUrl);
  assert.match(go("product=QLfl6", { INTL_STUDIO_PAYPAL_URL: intlUrl }), /link=QLfl6/);
  assert.match(go("product=QLfl6&offer=meta-studio-intl", {}), /link=QLfl6/);
  assert.match(go("product=QLfl6&offer=meta-studio-intl", { INTL_STUDIO_PAYPAL_URL: "https://evil.example/x" }), /link=QLfl6/);
});
