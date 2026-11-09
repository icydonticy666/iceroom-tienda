// Convierte un respaldo JSON (de R2 o de una copia local) en SQL para D1.
// Uso: node respaldos/restaurar.mjs iceroom-pagos-2026-11-09.json > restaurar.sql
// Luego, SOLO sobre una base vacía o de prueba:
//   npx wrangler d1 execute <base> --remote --file restaurar.sql
import { readFileSync } from "node:fs";

const archivo = process.argv[2];
if (!archivo) { console.error("Falta el archivo .json del respaldo"); process.exit(1); }
const { base, fecha, tablas } = JSON.parse(readFileSync(archivo, "utf8"));
const valor = (v) => v === null || v === undefined ? "NULL"
  : typeof v === "number" ? String(v)
  : "'" + String(v).replace(/'/g, "''") + "'";
const lineas = [`-- Respaldo de ${base} del ${fecha}`];
for (const [nombre, { sql, filas }] of Object.entries(tablas)) {
  lineas.push(sql.replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS ") + ";");
  for (const fila of filas) {
    const cols = Object.keys(fila).map((c) => `"${c}"`).join(", ");
    lineas.push(`INSERT OR IGNORE INTO "${nombre}" (${cols}) VALUES (${Object.values(fila).map(valor).join(", ")});`);
  }
}
process.stdout.write(lineas.join("\n") + "\n");
