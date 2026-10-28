import { json } from "../_lib/http.js";
import { SISTEMAS, correoValido, enlaceFirmado, registrarDescarga } from "../_lib/swap-descarga.js";

// POST {email, os, web} → guarda el correo y devuelve el enlace firmado de descarga.
// «web» es un campo trampa oculto: si viene lleno, es un bot y no se guarda nada.
export async function onRequestPost({ request, env }) {
  const cuerpo = await request.json().catch(() => ({}));
  const os = String(cuerpo.os || "");
  const email = correoValido(cuerpo.email);
  if (!SISTEMAS.includes(os)) return json({ error: "Elige Windows o Mac." }, 400);
  if (!email) return json({ error: "Escribe un correo válido." }, 400);
  if (!env.ORDER_SECRET || !env.PAYMENTS_DB) return json({ error: "La descarga no está disponible ahora." }, 503);
  if (!cuerpo.web) {
    await registrarDescarga(env.PAYMENTS_DB, email, os, request.headers.get("referer") || "");
  }
  return json({ url: await enlaceFirmado(env.ORDER_SECRET, os) });
}
