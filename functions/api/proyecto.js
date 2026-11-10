import { json, siteOrigin } from "../_lib/http.js";
import { ErrorProyecto, accionCliente, buscarPorId, buscarPorToken, enlaceProyecto, vistaCliente } from "../_lib/proyectos.js";

// Página del cliente: /proyecto?t=<token>. El token solo existe en su link; la base guarda su hash.

export async function onRequestGet({ request, env }) {
  if (!env.PAYMENTS_DB) return json({ error: "El seguimiento no está disponible en este momento." }, 503);
  const token = new URL(request.url).searchParams.get("t") || "";
  const proyecto = await buscarPorToken(env.PAYMENTS_DB, token);
  if (!proyecto) return json({ error: "Este link no es válido. Pide el link de tu proyecto con tu correo." }, 404);
  return json(await vistaCliente(env.PAYMENTS_DB, proyecto));
}

export async function onRequestPost({ request, env }) {
  if (!env.PAYMENTS_DB) return json({ error: "El seguimiento no está disponible en este momento." }, 503);
  if (Number(request.headers.get("content-length") || 0) > 16384) return json({ error: "Mensaje demasiado largo." }, 413);
  const datos = await request.json().catch(() => null);
  const proyecto = await buscarPorToken(env.PAYMENTS_DB, datos?.t);
  if (!proyecto) return json({ error: "Este link no es válido. Pide el link de tu proyecto con tu correo." }, 404);
  try {
    await accionCliente(env, proyecto, datos, enlaceProyecto(siteOrigin(request, env), datos.t));
    return json(await vistaCliente(env.PAYMENTS_DB, await buscarPorId(env.PAYMENTS_DB, proyecto.id)));
  } catch (error) {
    if (error instanceof ErrorProyecto) return json({ error: error.message }, error.status);
    console.error(JSON.stringify({ proyecto_accion_error: String(error?.message || error), proyecto: proyecto.id }));
    return json({ error: "No pudimos guardarlo. Intenta de nuevo en un momento." }, 500);
  }
}
