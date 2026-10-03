import { PRODUCTS, payhipKey } from "../_lib/catalog.js";

// URL estable de ICEROOM. Los enlaces de Payhip pueden cambiar al reemplazar un
// plan de precio; el navegador del cliente solo guarda esta ruta.
const OVERRIDES = {
  xNaVU: "https://payhip.com/order?link=xNaVU&pricing_plan=PjWlK9dkGv",
};

export function onRequestGet({ request }) {
  const productKey = new URL(request.url).searchParams.get("product") || "";
  const product = PRODUCTS[productKey];
  if (!product || product.testOnly) {
    return new Response("Producto no disponible", { status: 404 });
  }

  const destination = OVERRIDES[productKey]
    || `https://payhip.com/buy?s=1&link=${encodeURIComponent(payhipKey(product))}`;
  return Response.redirect(destination, 302);
}
