import { ARCHIVOS, regaloDe } from "../../../_lib/regalos.js";

// /regalo/<token>/d/<archivo>: descarga directa desde el bucket privado, solo con un token válido.
export async function onRequestGet({ params, env }) {
  const regalo = await regaloDe(params.token);
  const clave = String(params.archivo || "");
  if (!regalo || !regalo.archivos.includes(clave) || !ARCHIVOS[clave]) return new Response("Enlace no válido.", { status: 404 });
  if (!env.ENTREGAS) return new Response("Descarga no disponible ahora.", { status: 503 });
  const objeto = await env.ENTREGAS.get(ARCHIVOS[clave].r2);
  if (!objeto) return new Response("Archivo no encontrado. Escribe a soporte@iceroom.cl.", { status: 404 });
  const nombre = ARCHIVOS[clave].r2.split("/").pop();
  return new Response(objeto.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(objeto.size),
      "content-disposition": `attachment; filename="${nombre}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}
