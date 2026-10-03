import { json } from "../_lib/http.js";

/** País del visitante según Cloudflare (para mostrar CLP en Chile y USD afuera). */
export function onRequestGet({ request }) {
  return json({ country: request.cf?.country || "" });
}
