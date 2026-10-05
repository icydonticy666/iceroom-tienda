import { cyberActive, cyberPrice } from './campaign.js';

/** Precios CLP fijados en el servidor. El navegador no puede mandar el monto. */
export const PRODUCTS = {
  z6Bgp: { key: "z6Bgp", name: "Mezcla + Master — 1 canción", clp: 69990, kind: "service", checkout: "b" },
  SQti3: { key: "SQti3", name: "Pritti Backroom", clp: 4990, kind: "download", checkout: "b" },
  Nqvbs: { key: "Nqvbs", name: "Pritti Vocals", clp: 3990, kind: "download", checkout: "b" },
  "5JbVN": { key: "5JbVN", name: "Pritti Eco", clp: 4990, kind: "download", checkout: "b" },
  Vo0Sq: { key: "Vo0Sq", name: "Pritti Grip (Beta)", clp: 6990, kind: "download", checkout: "b" },
  G5U1r: { key: "G5U1r", name: "Pritti Bundle", clp: 19990, kind: "download", checkout: "order" },
  "34vZU": { key: "34vZU", name: "Plantilla FL — Plugins Nativos", clp: 2990, kind: "download", checkout: "b" },
  "0QEeV": { key: "0QEeV", name: "Plantilla de Grabación — FL Studio", clp: 12990, kind: "download", checkout: "b",
    promo: { clp: 9990, until: "2026-10-03T19:20:00.000Z" } },
  // Add-on oculto: Plantilla FL + Pritti Grip, Backroom y Eco por $2.990 adicionales.
  xNaVU: { key: "xNaVU", name: "Plantilla FL Studio + Pritti Grip, Backroom y Eco", clp: 15980, kind: "download", checkout: "order",
    promo: { clp: 12980, until: "2026-10-03T19:20:00.000Z" } },
  "3j8In": { key: "3j8In", name: "Plantilla de Grabación — Ableton Live", clp: 12990, kind: "download", checkout: "b",
    promo: { clp: 9990, until: "2026-10-03T19:20:00.000Z" } },
  "8Ljoq": { key: "8Ljoq", name: "Pack de Plantillas", clp: 19990, kind: "download", checkout: "order" },
  QLfl6: {
    key: "QLfl6",
    name: "Pritti Studio",
    clp: 29990,
    kind: "download",
    checkout: "order",
  },
  a8IWu: { key: "a8IWu", name: "Masterclass: Mezcla Pro", clp: 29990, kind: "download", checkout: "b" },
  IiHTG: { key: "IiHTG", name: "The Ultimate Bundle", clp: 59990, kind: "download", checkout: "order" },
  // Solo para compras de prueba con la clave TEST_KEY; entrega la Plantilla FL — Plugins Nativos.
  PRUEBA350: { key: "PRUEBA350", payhip: "34vZU", name: "Prueba de pago (Plantilla FL)", clp: 350, kind: "download", testOnly: true },
};

export function priceOf(product, now = new Date()) {
  if (!product.testOnly && cyberActive(now)) return cyberPrice(product.clp);
  if (product.promo && now.getTime() < Date.parse(product.promo.until)) return product.promo.clp;
  return product.clp;
}

export function allowedPrices(product) {
  const prices = [product.clp];
  if (!product.testOnly) prices.push(cyberPrice(product.clp));
  if (product.promo) prices.push(product.promo.clp);
  return prices;
}

export function parseRef(ref) {
  const match = /^tienda:([A-Za-z0-9]+):([a-f0-9]{32}):(\d+)$/.exec(String(ref || ""));
  if (!match || !PRODUCTS[match[1]]) return null;
  return { productKey: match[1], claim: match[2], clp: Number(match[3]) };
}

export function amountOk(payment, expectedClp) {
  if (!payment || payment.currency_id !== "CLP") return false;
  return Math.round(Number(payment.transaction_amount)) === expectedClp;
}

/**
 * Colección de Payhip (con SOLO ese bundle) por la que se entrega cada bundle.
 * Verificado el 30-sep-2026 en el checkout real: un cupón `single` creado por la API
 * sobre un bundle da "Coupon code is invalid" (los creados en el panel sí andan), pero
 * un cupón `collection` creado por la API sí se aplica al bundle. Sin colección
 * configurada, el bundle no se vende en pesos (solo PayPal) para no entregar un
 * cupón que no sirve. Las colecciones se crean en Payhip → Products → Collections.
 */
export const BUNDLE_COLLECTIONS = {
  // Colecciones "Entrega - <bundle>", creadas y OCULTAS el 30-sep-2026 (ocultas siguen aceptando cupones: probado).
  IiHTG: "yZGj9eAOBN",
  "8Ljoq": "bxGajoO6WD",
  G5U1r: "ZjBLydjbGm",
  QLfl6: "a6zYD8PkWq",
  xNaVU: "91zw9dAoGL",
};

/** Colecciones comerciales conocidas; permite respetar cupones de colección en el checkout local. */
export const PRODUCT_COLLECTIONS = Object.fromEntries(
  Object.keys(PRODUCTS).filter((key) => !PRODUCTS[key].testOnly).map((key) => [key, ["qLWx98Ybzk"]])
);
for (const [key, collection] of Object.entries(BUNDLE_COLLECTIONS)) {
  (PRODUCT_COLLECTIONS[key] ||= []).push(collection);
}

export function isBundle(product) {
  return product.checkout === "order";
}

export function bundleCollection(product) {
  return BUNDLE_COLLECTIONS[payhipKey(product)] || "";
}

/** Se puede cobrar en pesos solo si el cupón de entrega va a funcionar. */
export function sellableInClp(product) {
  return Boolean(product) && (!isBundle(product) || Boolean(bundleCollection(product)));
}

/** Producto de Payhip que se entrega (el de prueba entrega uno real). */
export function payhipKey(product) {
  return product.payhip || product.key;
}

/** Checkout directo de Payhip. Payhip no aplica cupones desde la URL: el código se pega en "Add coupon". */
export function redeemUrl(product) {
  return `https://payhip.com/buy?link=${encodeURIComponent(payhipKey(product))}`;
}

export function formatClp(amount) {
  return "$" + Number(amount).toLocaleString("es-CL");
}
