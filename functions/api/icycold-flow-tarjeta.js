import { siteOrigin } from "../_lib/http.js";
import { completarMembresia, flowListo } from "../_lib/icycold.js";

// Vuelta de Flow después de registrar la tarjeta (url_return de customer/register): llega por POST con `token`.
// Cobra el primer mes, crea la suscripción y lleva al artista de vuelta a /icycold con el resultado.
async function manejar(request, env) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") || "";
  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    token = String(form?.get("token") || token);
  }
  let resultado = "error";
  if (flowListo(env)) {
    try {
      resultado = await completarMembresia(env, url.searchParams.get("m"), token);
    } catch (error) {
      console.log(JSON.stringify({ icycold_tarjeta_error: String(error?.message || error) }));
    }
  }
  return Response.redirect(`${siteOrigin(request, env)}/icycold?pago=${resultado}#postular`, 303);
}

export const onRequestPost = ({ request, env }) => manejar(request, env);
export const onRequestGet = ({ request, env }) => manejar(request, env);
