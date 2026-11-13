import test from "node:test";
import assert from "node:assert/strict";
import { REGALOS, ARCHIVOS, regaloDe } from "./regalos.js";
import { onRequestGet as pagina } from "../regalo/[token]/index.js";
import { onRequestGet as descarga } from "../regalo/[token]/d/[archivo].js";

test("los regalos solo nombran archivos que existen", () => {
  for (const r of Object.values(REGALOS)) for (const a of r.archivos) assert.ok(ARCHIVOS[a], a);
});

test("token inválido: 404 en página y descarga, sin tocar el bucket", async () => {
  assert.equal(await regaloDe("corto"), null);
  assert.equal(await regaloDe("x".repeat(30)), null);
  const p = await pagina({ params: { token: "x".repeat(30) } });
  assert.equal(p.status, 404);
  assert.equal(p.headers.get("x-robots-tag"), "noindex, nofollow");
  let tocado = false;
  const d = await descarga({ params: { token: "x".repeat(30), archivo: "plantilla-fl" }, env: { ENTREGAS: { get: () => { tocado = true; } } } });
  assert.equal(d.status, 404);
  assert.equal(tocado, false);
});
