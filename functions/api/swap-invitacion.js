import { json } from "../_lib/http.js";
import { SISTEMAS, codigoValido, correoValido, devolverCupo, enlaceFirmado, registrarDescarga, usarInvitacion } from "../_lib/swap-descarga.js";
import { avisarLicencia } from "../_lib/swap-licencia.js";

async function sha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// POST {codigo, email, os, web} → activa swap Pro para ese correo (si la invitación es válida y
// tiene cupo) y devuelve el enlace firmado de descarga. «web» es el campo trampa de los bots.
export async function onRequestPost({ request, env }) {
  const cuerpo = await request.json().catch(() => ({}));
  const codigo = codigoValido(cuerpo.codigo);
  const email = correoValido(cuerpo.email);
  const os = String(cuerpo.os || "");
  if (!codigo) return json({ error: "Esta invitación no es válida." }, 404);
  if (!email) return json({ error: "Escribe un correo válido." }, 400);
  if (!SISTEMAS.includes(os)) return json({ error: "Elige Windows o Mac." }, 400);
  if (cuerpo.web) return json({ error: "Esta invitación no es válida." }, 404);
  if (!env.ORDER_SECRET || !env.PAYMENTS_DB || !env.SWAP_LICENCIAS_TOKEN) {
    return json({ error: "Las invitaciones no están disponibles ahora." }, 503);
  }

  const uso = await usarInvitacion(env.PAYMENTS_DB, codigo, email);
  if (uso.error === "invalida") return json({ error: "Esta invitación no es válida." }, 404);
  if (uso.error === "agotada") return json({ error: "Esta invitación ya no tiene cupos. Escríbenos por Instagram @iceroomcl." }, 409);

  // Mismo correo + mismo código = mismo pago: repetir no duplica nada en el servidor de licencias.
  const pago = `inv-${codigo}-${(await sha256(email)).slice(0, 16)}`;
  const activado = await avisarLicencia(env, { email, pago, proveedor: "invitacion", estado: "completado" });
  if (!activado) {
    if (uso.nuevo) await devolverCupo(env.PAYMENTS_DB, codigo, email);
    return json({ error: "No pudimos activar tu acceso ahora. Inténtalo de nuevo en un rato." }, 503);
  }
  await registrarDescarga(env.PAYMENTS_DB, email, os, `invitacion:${codigo}`);
  return json({ url: await enlaceFirmado(env.ORDER_SECRET, os), email });
}
