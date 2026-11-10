import { json, siteOrigin } from "../_lib/http.js";
import { enviarEnlaces } from "../_lib/proyectos.js";

// "Perdí el link de mi proyecto": manda los links al correo de la compra. Siempre responde lo
// mismo, haya o no proyectos, para no revelar quién compró.
export async function onRequestPost({ request, env }) {
  if (!env.PAYMENTS_DB) return json({ error: "El seguimiento no está disponible en este momento." }, 503);
  const datos = await request.json().catch(() => null);
  try { await enviarEnlaces(env, datos?.email, siteOrigin(request, env)); }
  catch (error) { console.error(JSON.stringify({ proyecto_enlace_error: String(error?.message || error) })); }
  return json({ ok: true, mensaje: "Si hay proyectos con ese correo, te llegará el link en unos minutos. Revisa también spam." });
}
