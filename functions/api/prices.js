import { PRODUCTS, sellableInClp } from "../_lib/catalog.js";
import { currentPrice } from "../_lib/intents.js";
import { json } from "../_lib/http.js";

export async function onRequestGet({ env, request }) {
  const prices = {};
  const offer = request ? new URL(request.url).searchParams.get("offer") || "" : "";
  // Sin precio en pesos la hoja ofrece solo PayPal (bundles sin colección de entrega).
  for (const product of Object.values(PRODUCTS)) if (!product.testOnly && sellableInClp(product)) prices[product.key] = await currentPrice(env, product, offer);
  return json(prices);
}
