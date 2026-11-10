import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createIntent } from "./intents.js";
import { fulfill } from "./fulfill.js";
import { enlaceValido, iniciarProyecto, progreso, sumarPlazo } from "./proyectos.js";
import { onRequestGet as verProyecto, onRequestPost as accionProyecto } from "../api/proyecto.js";
import { onRequestPost as pedirEnlace } from "../api/proyecto-enlace.js";
import { onRequestGet as estudioGet, onRequestPost as estudioPost } from "../api/estudio.js";
import { procesarServicios } from "../api/payhip-webhook.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../../schema.sql", import.meta.url), "utf8"));
  const sentencia = (sql, args = []) => ({
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
  });
  return {
    prepare(sql) { return { ...sentencia(sql), bind: (...args) => sentencia(sql, args) }; },
    close() { sqlite.close(); },
  };
}

const ESTUDIO = "e".repeat(40);
function entorno() {
  return { PAYMENTS_DB: database(), ORDER_SECRET: "order-secret", RESEND_API_KEY: "re_test", EMAIL_FROM: "iceroom <soporte@iceroom.cl>",
    PUBLIC_ORIGIN: "https://iceroom.example", ESTUDIO_TOKEN: ESTUDIO, PAYHIP_API_KEY: "payhip-secret" };
}

// Captura los correos que irían a Resend (y responde a Payhip si hace falta un cupón).
function correos() {
  const enviados = [];
  const previo = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("resend.com")) { enviados.push(JSON.parse(options.body)); return Response.json({ id: "x" }); }
    if (String(url).includes("payhip.com/api/v2/coupons")) {
      const f = new URLSearchParams(options.body);
      return Response.json({ data: { id: 1, code: f.get("code"), product_key: f.get("product_key"), coupon_type: "single", percent_off: 100, usage_limit: 1, notes: f.get("notes") } });
    }
    throw new Error("fetch inesperado: " + url);
  };
  return { enviados, restaurar() { globalThis.fetch = previo; } };
}

const tokenDeLink = (texto) => /\/proyecto\?t=([A-Za-z0-9_-]+)/.exec(texto)?.[1];
const ver = async (env, t) => (await verProyecto({ request: new Request("https://iceroom.example/api/proyecto?t=" + t), env })).json();
const actuar = (env, datos) => accionProyecto({ request: new Request("https://iceroom.example/api/proyecto", { method: "POST", body: JSON.stringify(datos) }), env });
const estudio = (env, datos, clave = ESTUDIO) => estudioPost({ request: new Request("https://iceroom.example/api/estudio", {
  method: "POST", headers: { authorization: "Bearer " + clave }, body: JSON.stringify(datos) }), env });

test("plazos: 72 horas corridas y 5 días hábiles (sin fines de semana, hora de Chile)", () => {
  const viernes = new Date("2026-11-13T15:00:00Z");
  assert.equal(sumarPlazo(viernes, { horas: 72 }).toISOString(), "2026-11-16T15:00:00.000Z");
  assert.equal(sumarPlazo(viernes, { habiles: 5 }).toISOString(), "2026-11-20T15:00:00.000Z");
  assert.equal(sumarPlazo(new Date("2026-11-16T15:00:00Z"), { habiles: 3 }).toISOString(), "2026-11-19T15:00:00.000Z");
  assert.equal(enlaceValido("javascript:alert(1)"), "");
  assert.equal(enlaceValido("http://wetransfer.com/x"), "");
  assert.equal(enlaceValido("https://we.tl/t-abc"), "https://we.tl/t-abc");
});

test("Plantilla a tu voz: compra → material → versión → 1 ajuste → aprobación, con correos y link estable", async () => {
  const env = entorno();
  const mail = correos();
  try {
    const r = await iniciarProyecto(env, { producto: "JXKg8", email: "Cliente@Correo.cl", origen: "payhip", pago: "ORD1:JXKg8" }, env.PUBLIC_ORIGIN);
    assert.equal(r.nuevo, true);
    const otra = await iniciarProyecto(env, { producto: "JXKg8", email: "cliente@correo.cl", origen: "payhip", pago: "ORD1:JXKg8" }, env.PUBLIC_ORIGIN);
    assert.equal(otra.nuevo, false);
    assert.equal(otra.proyecto.id, r.proyecto.id);
    // Bienvenida al cliente (con link y lo que debe mandar) + aviso a soporte@, una sola vez.
    assert.equal(mail.enviados.length, 2);
    const bienvenida = mail.enviados.find((m) => m.to[0] === "cliente@correo.cl");
    assert.match(bienvenida.subject, /Plantilla a tu voz/);
    assert.match(bienvenida.text, /acapella/);
    assert.equal(mail.enviados.find((m) => m.to[0] === "soporte@iceroom.cl").subject.startsWith("[Estudio] Nueva compra"), true);
    const t = tokenDeLink(bienvenida.text);
    assert.ok(t && t.length >= 30);

    let v = await ver(env, t);
    assert.equal(v.estado, "esperando_material");
    assert.equal(v.turno, "cliente");
    assert.equal(v.progreso, 0);
    assert.deepEqual(v.acciones, ["material", "nota"]);
    assert.equal((await verProyecto({ request: new Request("https://iceroom.example/api/proyecto?t=malo" + "x".repeat(30)), env })).status, 404);

    // El enlace tiene que ser https.
    assert.equal((await actuar(env, { t, accion: "material", enlace: "javascript:alert(1)" })).status, 400);
    v = await (await actuar(env, { t, accion: "material", enlace: "https://we.tl/t-voz", programa: "FL Studio 21", equipo: "SM7B + Scarlett", referencias: "Bad Bunny" })).json();
    assert.equal(v.estado, "en_produccion");
    assert.equal(v.turno, "icycold");
    assert.ok(v.venceEn);
    assert.ok(Math.abs(Date.parse(v.venceEn) - Date.now() - 72 * 3600000) < 60000);

    // Panel: sin clave no entra; con clave entrega la versión 1.
    assert.equal((await estudio(env, { accion: "entregar", id: v.id }, "otra-clave-" + "x".repeat(30))).status, 401);
    assert.equal((await estudio(env, { accion: "entregar", id: v.id })).status, 400); // falta enlace
    assert.equal((await estudio(env, { accion: "entregar", id: v.id, enlace: "https://drive.google.com/v1", texto: "Primera versión" })).status, 200);
    v = await ver(env, t); // el mismo link sigue funcionando después de entregar
    assert.equal(v.estado, "revision_cliente");
    assert.equal(v.version, 1);
    assert.deepEqual(v.acciones, ["aprobar", "pedir_ajuste", "nota"]);
    assert.ok(mail.enviados.some((m) => m.to[0] === "cliente@correo.cl" && /versión 1 está lista/.test(m.subject) && m.text.includes("https://drive.google.com/v1")));

    v = await (await actuar(env, { t, accion: "pedir_ajuste", texto: "Más brillo en la voz" })).json();
    assert.equal(v.estado, "ajuste");
    assert.equal(v.rondasUsadas, 1);
    await estudio(env, { accion: "entregar", id: v.id, enlace: "https://drive.google.com/v2" });
    v = await ver(env, t);
    assert.equal(v.version, 2);
    assert.deepEqual(v.acciones, ["aprobar", "nota"]); // ya no quedan rondas
    const sinRondas = await actuar(env, { t, accion: "pedir_ajuste", texto: "Otro cambio" });
    assert.equal(sinRondas.status, 400);
    assert.match((await sinRondas.json()).error, /ronda/);

    v = await (await actuar(env, { t, accion: "aprobar", texto: "¡Quedó increíble!" })).json();
    assert.equal(v.estado, "completado");
    assert.equal(v.progreso, 100);
    assert.equal(v.historial.filter((e) => e.tipo === "entrega").length, 2);
    // Todos los correos van desde el remitente de la tienda y con respuesta a soporte@.
    assert.ok(mail.enviados.every((m) => m.from === env.EMAIL_FROM && m.reply_to === "soporte@iceroom.cl"));
  } finally { mail.restaurar(); env.PAYMENTS_DB.close(); }
});

test("Mezcla + Master: 5 días hábiles, 2 rondas y avance por paso", async () => {
  const env = entorno();
  const mail = correos();
  try {
    const r = await iniciarProyecto(env, { producto: "z6Bgp", email: "a@b.cl", origen: "manual", pago: "m1" }, env.PUBLIC_ORIGIN);
    const t = tokenDeLink(mail.enviados[0].text);
    await actuar(env, { t, accion: "material", enlace: "https://we.tl/stems" });
    const pasos = [progreso({ ...r.proyecto, estado: "en_produccion" })];
    for (const ronda of [1, 2]) {
      await estudio(env, { accion: "entregar", id: r.proyecto.id, enlace: `https://drive.google.com/mix${ronda}` });
      pasos.push((await ver(env, t)).progreso);
      await actuar(env, { t, accion: "pedir_ajuste", texto: `Cambios ronda ${ronda}` });
      pasos.push((await ver(env, t)).progreso);
    }
    await estudio(env, { accion: "entregar", id: r.proyecto.id, enlace: "https://drive.google.com/master" });
    const final = await ver(env, t);
    assert.equal(final.version, 3);
    assert.deepEqual(final.acciones, ["aprobar", "nota"]);
    pasos.push(final.progreso);
    assert.ok(pasos.every((x, i) => i === 0 || x > pasos[i - 1]), "el avance siempre sube: " + pasos.join(","));
  } finally { mail.restaurar(); env.PAYMENTS_DB.close(); }
});

test("aviso de Payhip: crea el proyecto una vez, ignora canjes de $0 y cancela al reembolsar", async () => {
  const env = entorno();
  const mail = correos();
  try {
    const orden = { id: "PH1", type: "paid", email: "pp@correo.com", price: 29.99, items: [{ product_key: "JXKg8" }, { product_key: "Nqvbs" }] };
    assert.equal(await procesarServicios(env, orden, "completado"), true);
    assert.equal(await procesarServicios(env, orden, "completado"), true); // reintento de Payhip
    const n = async () => (await env.PAYMENTS_DB.prepare("SELECT COUNT(*) AS n FROM proyectos").first()).n;
    assert.equal(await n(), 1);
    await procesarServicios(env, { ...orden, id: "PH2", price: 0 }, "completado");
    assert.equal(await n(), 1);
    await procesarServicios(env, { ...orden, type: "refunded", amount_refunded: 29.99 }, "cancelado");
    const p = await env.PAYMENTS_DB.prepare("SELECT estado FROM proyectos WHERE pago = 'PH1:JXKg8'").first();
    assert.equal(p.estado, "cancelado");
  } finally { mail.restaurar(); env.PAYMENTS_DB.close(); }
});

test("pago en pesos de un servicio: el correo de compra trae el link del proyecto, y el reembolso lo cancela", async () => {
  const env = entorno();
  const mail = correos();
  try {
    const intent = await createIntent(env, "JXKg8", "flow", "pesos@correo.cl");
    const pago = { id: "flow-777", status: "approved", currency_id: "CLP", transaction_amount: intent.amount,
      external_reference: `tienda:JXKg8:${intent.claim}:${intent.amount}`, payer: { email: "pesos@correo.cl" } };
    const r = await fulfill(env, pago, { claim: intent.claim, origin: env.PUBLIC_ORIGIN });
    assert.equal(r.status, "approved");
    assert.match(r.proyectoUrl, /\/proyecto\?t=/);
    await fulfill(env, pago, { claim: intent.claim, origin: env.PUBLIC_ORIGIN }); // la pantalla de pago consulta de nuevo
    const alCliente = mail.enviados.filter((m) => m.to[0] === "pesos@correo.cl");
    assert.equal(alCliente.length, 1);
    assert.match(alCliente[0].text, /Pago aprobado por \$29\.990 CLP/);
    assert.ok(alCliente[0].text.includes(r.proyectoUrl));
    assert.equal((await env.PAYMENTS_DB.prepare("SELECT COUNT(*) AS n FROM proyectos").first()).n, 1);
    await fulfill(env, { ...pago, status: "refunded" }, { claim: intent.claim });
    assert.equal((await env.PAYMENTS_DB.prepare("SELECT estado FROM proyectos").first()).estado, "cancelado");
  } finally { mail.restaurar(); env.PAYMENTS_DB.close(); }
});

test("panel: lista y detalle con clave; proyecto manual de prueba se puede borrar; 'perdí mi link' no revela compras", async () => {
  const env = entorno();
  const mail = correos();
  try {
    assert.equal((await estudioGet({ request: new Request("https://iceroom.example/api/estudio"), env })).status, 401);
    const creado = await (await estudio(env, { accion: "crear", producto: "JXKg8", email: "yo@iceroom.cl", nombre: "Prueba", prueba: true })).json();
    assert.ok(creado.id);
    assert.ok(mail.enviados.every((m) => m.subject.startsWith("[PRUEBA]")));
    const lista = await (await estudioGet({ request: new Request("https://iceroom.example/api/estudio", { headers: { authorization: "Bearer " + ESTUDIO } }), env })).json();
    assert.equal(lista.proyectos.length, 1);
    const detalle = await (await estudioGet({ request: new Request("https://iceroom.example/api/estudio?id=" + creado.id, { headers: { authorization: "Bearer " + ESTUDIO } }), env })).json();
    assert.match(detalle.link, /\/proyecto\?t=/);

    const antes = mail.enviados.length;
    const pedir = (email) => pedirEnlace({ request: new Request("https://iceroom.example/api/proyecto-enlace", { method: "POST", body: JSON.stringify({ email }) }), env }).then((r) => r.json());
    const a = await pedir("yo@iceroom.cl");
    const b = await pedir("nadie@correo.cl");
    assert.equal(a.mensaje, b.mensaje);
    assert.equal(mail.enviados.length, antes + 1);
    assert.ok(mail.enviados.at(-1).text.includes(detalle.link)); // el link no cambia

    assert.equal((await estudio(env, { accion: "eliminar", id: creado.id })).status, 200);
    assert.equal((await env.PAYMENTS_DB.prepare("SELECT COUNT(*) AS n FROM proyectos").first()).n, 0);
  } finally { mail.restaurar(); env.PAYMENTS_DB.close(); }
});
