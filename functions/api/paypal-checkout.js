import { PRODUCTS, directOffer, payhipKey } from "../_lib/catalog.js";

// URL estable de ICEROOM. Los enlaces de Payhip pueden cambiar al reemplazar un
// plan de precio; el navegador del cliente solo guarda esta ruta.
const OVERRIDES = {
  xNaVU: "https://payhip.com/order?link=xNaVU&pricing_plan=91zw89XoBL",
};

export function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const productKey = params.get("product") || "";
  const product = PRODUCTS[productKey];
  if (!product || product.testOnly) {
    return new Response("Producto no disponible", { status: 404 });
  }

  // Oferta internacional del anuncio: PayPal a US$14.99 en un bundle oculto de Payhip (INTL_STUDIO_PAYPAL_URL).
  // Sin esa URL va al precio normal de Payhip (se ve antes de pagar): no lanzar el anuncio hasta configurarla.
  const intlUrl = String(env?.INTL_STUDIO_PAYPAL_URL || "");
  if (params.get("offer") === "meta-studio-intl" && directOffer(product, "meta-studio-intl") && /^https:\/\/payhip\.com\//.test(intlUrl)) {
    return Response.redirect(intlUrl, 302);
  }
  const destination = OVERRIDES[productKey]
    || `https://payhip.com/buy?s=1&link=${encodeURIComponent(payhipKey(product))}`;
  return Response.redirect(destination, 302);
}
