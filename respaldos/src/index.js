// Respaldo diario de las bases D1 de iceroom en R2 (bucket privado iceroom-respaldos).
// Cada día escribe <base>/<AAAA-MM-DD>.json con la estructura (CREATE) y todas las filas de
// cada tabla, y borra los respaldos con más de DIAS_GUARDADOS días.
// Restaurar: node respaldos/restaurar.mjs <archivo.json> > restaurar.sql y luego
// `wrangler d1 execute <base> --remote --file restaurar.sql` (ver respaldos/README.md).

const BASES = { PAGOS: "iceroom-pagos", LICENCIAS: "swap-licencias" };
const POR_PAGINA = 500;

async function volcar(db) {
  const { results: tablas } = await db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
  ).all();
  const salida = { tablas: {} };
  for (const { name, sql } of tablas) {
    const filas = [];
    for (let desde = 0; ; desde += POR_PAGINA) {
      const { results } = await db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}" LIMIT ? OFFSET ?`)
        .bind(POR_PAGINA, desde).all();
      filas.push(...results);
      if (results.length < POR_PAGINA) break;
    }
    salida.tablas[name] = { sql, filas };
  }
  return salida;
}

async function limpiar(bucket, prefijo, dias) {
  const limite = Date.now() - dias * 86400000;
  let cursor;
  do {
    const lista = await bucket.list({ prefix: prefijo + "/", cursor });
    const viejos = lista.objects.filter((o) => o.uploaded.getTime() < limite).map((o) => o.key);
    if (viejos.length) await bucket.delete(viejos);
    cursor = lista.truncated ? lista.cursor : undefined;
  } while (cursor);
}

export async function respaldar(env, ahora = new Date()) {
  const dia = ahora.toISOString().slice(0, 10);
  const informe = {};
  for (const [binding, nombre] of Object.entries(BASES)) {
    const datos = await volcar(env[binding]);
    const cuerpo = JSON.stringify({ base: nombre, fecha: ahora.toISOString(), ...datos });
    await env.RESPALDOS.put(`${nombre}/${dia}.json`, cuerpo, {
      httpMetadata: { contentType: "application/json" },
    });
    await limpiar(env.RESPALDOS, nombre, Number(env.DIAS_GUARDADOS || 60));
    informe[nombre] = Object.fromEntries(Object.entries(datos.tablas).map(([t, v]) => [t, v.filas.length]));
  }
  console.log(JSON.stringify({ respaldo: dia, filas: informe }));
  return informe;
}

export default {
  async scheduled(_evento, env, ctx) {
    ctx.waitUntil(respaldar(env));
  },
};
