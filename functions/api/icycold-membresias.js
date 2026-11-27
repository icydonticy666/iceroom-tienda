import { json, paymentOrigin } from "../_lib/http.js";
import { PLANES, cancelarMembresia, crearPlanesFlow, flowListo, tablaMembresias } from "../_lib/icycold.js";

// Panel /estudio (Bearer ESTUDIO_TOKEN): membresías ICYCOLD pagadas con Flow.
function igual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function autorizado(request, env) {
  const clave = String(env.ESTUDIO_TOKEN || "").trim();
  const enviado = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return clave.length >= 32 && igual(enviado, clave);
}

export async function onRequestGet({ request, env }) {
  if (!env.PAYMENTS_DB || !env.ESTUDIO_TOKEN) return json({ error: "Panel no configurado." }, 503);
  if (!autorizado(request, env)) return json({ error: "Clave incorrecta." }, 401);
  await tablaMembresias(env.PAYMENTS_DB);
  const { results } = await env.PAYMENTS_DB.prepare(
    "SELECT id, creado, actualizado, plan, nombre, email, artista, musica, objetivo, pais, estado, flow_subscription, primer_monto, tarjeta, nota " +
    "FROM membresias WHERE estado != 'tarjeta' OR nota IS NOT NULL ORDER BY id DESC LIMIT 200").all();
  return json({ membresias: (results || []).map((m) => ({ ...m, planNombre: PLANES[m.plan]?.nombre || m.plan, precio: PLANES[m.plan]?.cl || 0 })) });
}

export async function onRequestPost({ request, env }) {
  if (!env.PAYMENTS_DB || !env.ESTUDIO_TOKEN) return json({ error: "Panel no configurado." }, 503);
  if (!autorizado(request, env)) return json({ error: "Clave incorrecta." }, 401);
  if (!flowListo(env)) return json({ error: "Flow no está configurado." }, 503);
  const d = await request.json().catch(() => ({})) || {};
  try {
    if (d.accion === "crear-planes") {
      const origin = paymentOrigin(env);
      if (!origin) return json({ error: "Falta PUBLIC_ORIGIN." }, 503);
      return json({ planes: await crearPlanesFlow(env, origin) });
    }
    if (d.accion === "cancelar") {
      await cancelarMembresia(env, d.id, Boolean(d.inmediato));
      return json({ ok: true });
    }
  } catch (error) {
    return json({ error: String(error?.message || error).slice(0, 200) }, 502);
  }
  return json({ error: "Acción no válida." }, 400);
}
