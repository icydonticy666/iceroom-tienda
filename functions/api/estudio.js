import { json, siteOrigin } from "../_lib/http.js";
import {
  ErrorProyecto, FINALES, SERVICIOS, accionEstudio, buscarPorId, etiqueta, eventos, iniciarProyecto,
  linkDe, progreso, servicioDe, turnoDe,
} from "../_lib/proyectos.js";

// Panel de icycold (/estudio). Acceso con el secreto ESTUDIO_TOKEN en "Authorization: Bearer …".

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

function resumen(p) {
  return {
    id: p.id, servicio: servicioDe(p.producto)?.nombre || p.producto, email: p.email, nombre: p.nombre || "",
    estado: p.estado, titulo: etiqueta(p).titulo, turno: turnoDe(p.estado), progreso: progreso(p),
    venceEn: p.vence_en, version: p.version, rondasUsadas: p.rondas_usadas, rondas: servicioDe(p.producto)?.rondas || 0,
    origen: p.origen, prueba: Boolean(p.prueba), creado: p.creado, actualizado: p.actualizado,
  };
}

export async function onRequestGet({ request, env }) {
  if (!env.PAYMENTS_DB || !env.ESTUDIO_TOKEN) return json({ error: "Panel no configurado." }, 503);
  if (!autorizado(request, env)) return json({ error: "Clave incorrecta." }, 401);
  const db = env.PAYMENTS_DB;
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const p = await buscarPorId(db, id);
    if (!p) return json({ error: "Proyecto no encontrado." }, 404);
    return json({ ...resumen(p), link: await linkDe(env, p, siteOrigin(request, env)), historial: await eventos(db, p.id) });
  }
  const { results } = await db.prepare("SELECT * FROM proyectos ORDER BY creado DESC LIMIT 300").all();
  const lista = (results || []).map(resumen);
  const orden = (p) => (FINALES.has(p.estado) ? 2 : p.turno === "icycold" ? 0 : 1);
  lista.sort((a, b) => orden(a) - orden(b) || String(a.venceEn || "9").localeCompare(String(b.venceEn || "9")));
  return json({ proyectos: lista, servicios: Object.entries(SERVICIOS).map(([key, s]) => ({ key, nombre: s.nombre })) });
}

export async function onRequestPost({ request, env }) {
  if (!env.PAYMENTS_DB || !env.ESTUDIO_TOKEN) return json({ error: "Panel no configurado." }, 503);
  if (!autorizado(request, env)) return json({ error: "Clave incorrecta." }, 401);
  const db = env.PAYMENTS_DB;
  const datos = await request.json().catch(() => null) || {};
  const origin = siteOrigin(request, env);
  try {
    if (datos.accion === "crear") {
      // Proyecto a mano: ventas por DM, regalos o pruebas. Manda el mismo correo de bienvenida.
      if (!servicioDe(datos.producto)) throw new ErrorProyecto("Elige un servicio.");
      const pago = "manual-" + crypto.randomUUID();
      const r = await iniciarProyecto(env, { producto: datos.producto, email: datos.email, nombre: datos.nombre,
        origen: "manual", pago, prueba: Boolean(datos.prueba) }, origin);
      if (!r) throw new ErrorProyecto("Revisa el correo del cliente.");
      return json({ ok: true, id: r.proyecto.id });
    }
    const p = await buscarPorId(db, datos.id);
    if (!p) return json({ error: "Proyecto no encontrado." }, 404);
    if (datos.accion === "eliminar") {
      if (!p.prueba) throw new ErrorProyecto("Solo se pueden eliminar proyectos de prueba.");
      await db.prepare("DELETE FROM proyecto_eventos WHERE proyecto_id = ?").bind(p.id).run();
      await db.prepare("DELETE FROM proyectos WHERE id = ?").bind(p.id).run();
      return json({ ok: true });
    }
    await accionEstudio(env, p, datos, origin);
    const nuevo = await buscarPorId(db, p.id);
    return json({ ...resumen(nuevo), link: await linkDe(env, nuevo, origin), historial: await eventos(db, p.id) });
  } catch (error) {
    if (error instanceof ErrorProyecto) return json({ error: error.message }, error.status);
    console.error(JSON.stringify({ estudio_error: String(error?.message || error) }));
    return json({ error: "No se pudo guardar." }, 500);
  }
}
