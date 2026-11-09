import { json } from "../_lib/http.js";
import { SISTEMAS, correoValido, enlaceFirmado, registrarDescarga } from "../_lib/swap-descarga.js";

// POST {email, os, web} → guarda el correo y devuelve el enlace firmado de descarga.
// «web» es un campo trampa oculto: si viene lleno, es un bot y no se guarda nada.
export async function onRequestPost({ request, env }) {
  const formulario = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
  const cuerpo = formulario
    ? Object.fromEntries(await request.formData().catch(() => new FormData()))
    : await request.json().catch(() => ({}));
  const os = String(cuerpo.os || "");
  const email = correoValido(cuerpo.email);
  if (!SISTEMAS.includes(os)) return json({ error: "Elige Windows o Mac." }, 400);
  if (!email) return json({ error: "Escribe un correo válido." }, 400);
  if (!env.ORDER_SECRET || !env.PAYMENTS_DB) return json({ error: "La descarga no está disponible ahora." }, 503);
  if (!cuerpo.web) {
    try {
      await registrarDescarga(env.PAYMENTS_DB, email, os, request.headers.get("referer") || "");
    } catch {
      return json({ error: "No pudimos preparar la descarga. Inténtalo nuevamente o escribe a soporte@iceroom.cl." }, 503);
    }
  }
  const url = await enlaceFirmado(env.ORDER_SECRET, os);
  if (formulario) {
    return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Descarga SWAP · iceroom</title><body style="background:#111;color:#eee;font:18px/1.6 system-ui;max-width:600px;margin:10vh auto;padding:24px"><h1>Tu descarga está lista.</h1><p><a style="color:#cdb3ee" href="${url.replaceAll('&', '&amp;')}">Descargar SWAP</a></p><p>El enlace dura 15 minutos. Usa el mismo correo al entrar a la app.</p><p><a style="color:#cdb3ee" href="/swap-ayuda">Ayuda de instalación / Installation help</a></p><p><a style="color:#cdb3ee" href="/swap">Volver a SWAP</a></p></body></html>`, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
    });
  }
  return json({ url });
}
