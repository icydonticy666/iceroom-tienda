import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCTS, directOffer } from "./catalog.js";
import { onRequestGet as paypalCheckout } from "../api/paypal-checkout.js";

const studio = PRODUCTS.QLfl6;
const intlUrl = "https://payhip.com/order?link=INTL1499";

test("la oferta internacional histórica fue de $14.990 y venció el 25-oct 23:59 CL", () => {
  assert.equal(directOffer(studio, "meta-studio-intl", new Date("2026-10-20T12:00:00Z")).usd, 1499);
  assert.equal(directOffer(studio, "meta-studio-intl", new Date("2026-10-26T02:59:00Z")), null);
  assert.equal(directOffer(PRODUCTS["0QEeV"], "meta-studio-intl"), null);
});

test("PayPal ya no aplica la oferta internacional vencida", () => {
  // Desde el 5-nov-2026 Pritti Studio incluye swap Pro: solo se cobra con su entrega Pro configurada.
  const swap = { SWAP_PRO_DELIVERY_READY: "1", SWAP_STUDIO_PRODUCT_KEY: "QLfl6" };
  const go = (query, env) => paypalCheckout({ request: new Request("https://iceroom.cl/api/paypal-checkout?" + query), env: { ...swap, ...env } })
    .headers.get("location");
  assert.match(go("product=QLfl6&offer=meta-studio-intl", { INTL_STUDIO_PAYPAL_URL: intlUrl }), /link=QLfl6/);
  assert.match(go("product=QLfl6", { INTL_STUDIO_PAYPAL_URL: intlUrl }), /link=QLfl6/);
  assert.match(go("product=QLfl6&offer=meta-studio-intl", {}), /link=QLfl6/);
  assert.match(go("product=QLfl6&offer=meta-studio-intl", { INTL_STUDIO_PAYPAL_URL: "https://evil.example/x" }), /link=QLfl6/);
});
