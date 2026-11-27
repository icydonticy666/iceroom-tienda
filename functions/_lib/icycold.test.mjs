import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { completarMembresia, crearPlanesFlow, iniciarMembresia, registrarCobroMensual, unMesDespues } from "./icycold.js";
import { onRequestPost as suscribir } from "../api/icycold-suscribir.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  const sentencia = (sql, args = []) => ({
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
  });
  return { prepare(sql) { return { ...sentencia(sql), bind: (...args) => sentencia(sql, args) }; }, sqlite };
}

// Flow simulado: registra cada llamada y responde según la ruta.
function flowFalso({ cargo = 2, registro = "1" } = {}) {
  const llamadas = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const params = Object.fromEntries(init.body ? new URLSearchParams(init.body) : u.searchParams);
    llamadas.push({ ruta: u.pathname, params, host: u.host });
    const r = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (u.host === "api.resend.com") return r({ id: "mail" });
    switch (u.pathname) {
      case "/api/customer/create": return r({ customerId: "cus_1" });
      case "/api/customer/register": return r({ url: "https://www.flow.cl/app/customer/disclaimer.php", token: "tok1" });
      case "/api/customer/getRegisterStatus": return r({ status: registro, customerId: "cus_1", creditCardType: "Visa", last4CardDigits: "0366" });
      case "/api/customer/charge": return r({ flowOrder: 999, status: cargo, payer: "a@b.cl", amount: params.amount });
      case "/api/subscription/create": return r({ subscriptionId: "sus_1", status: 0 });
      case "/api/plans/create": return r({ planId: params.planId });
      case "/api/payment/getStatus": return r({ flowOrder: 1234, commerceOrder: "x", status: 2, amount: 89990, currency: "CLP", payer: "a@b.cl", subject: "ICYCOLD" });
      default: return r({ message: "ruta desconocida" }, 400);
    }
  };
  return llamadas;
}

const entorno = () => ({ PAYMENTS_DB: database(), FLOW_API_KEY: "k", FLOW_SECRET_KEY: "s", RESEND_API_KEY: "re", EMAIL_FROM: "x <s@iceroom.cl>", PUBLIC_ORIGIN: "https://iceroom.example" });
const datos = { plan: "mix-master", nombre: "Ana", email: "a@b.cl", artista: "@ana", musica: "", objetivo: "", pais: "CL" };

test("alta completa: tarjeta, primer mes con descuento y suscripción desde el mes siguiente", async () => {
  const env = entorno(); const llamadas = flowFalso();
  const { id, url } = await iniciarMembresia(env, "https://iceroom.example", datos);
  assert.equal(url, "https://www.flow.cl/app/customer/disclaimer.php?token=tok1");
  const reg = llamadas.find((l) => l.ruta === "/api/customer/register");
  assert.equal(reg.params.url_return, `https://iceroom.example/api/icycold-flow-tarjeta?m=${id}`);
  assert.ok(reg.params.s, "va firmado");

  assert.equal(await completarMembresia(env, id, "tokR"), "ok");
  const cargo = llamadas.find((l) => l.ruta === "/api/customer/charge");
  assert.equal(cargo.params.amount, "79990");
  assert.equal(cargo.params.currency, "CLP");
  const sub = llamadas.find((l) => l.ruta === "/api/subscription/create");
  assert.equal(sub.params.planId, "icycold-mix-master");
  assert.equal(sub.params.subscription_start, unMesDespues());
  const m = await env.PAYMENTS_DB.prepare("SELECT * FROM membresias WHERE id = ?1").bind(id).first();
  assert.equal(m.estado, "activa");
  assert.equal(m.flow_subscription, "sus_1");
  assert.equal(llamadas.filter((l) => l.host === "api.resend.com").length, 2, "aviso a soporte + bienvenida");

  // Una segunda vuelta (recarga, doble POST) no cobra de nuevo.
  assert.equal(await completarMembresia(env, id, "tokR"), "ok");
  assert.equal(llamadas.filter((l) => l.ruta === "/api/customer/charge").length, 1);
});

test("cobro rechazado: no crea suscripción y queda para reintentar", async () => {
  const env = entorno(); const llamadas = flowFalso({ cargo: 3 });
  const { id } = await iniciarMembresia(env, "https://iceroom.example", datos);
  assert.equal(await completarMembresia(env, id, "t"), "rechazado");
  assert.equal(llamadas.some((l) => l.ruta === "/api/subscription/create"), false);
});

test("tarjeta no registrada: no cobra", async () => {
  const env = entorno(); const llamadas = flowFalso({ registro: "0" });
  const { id } = await iniciarMembresia(env, "https://iceroom.example", datos);
  assert.equal(await completarMembresia(env, id, "t"), "sin-tarjeta");
  assert.equal(llamadas.some((l) => l.ruta === "/api/customer/charge"), false);
});

test("token de otro cliente: no cobra", async () => {
  const env = entorno(); const llamadas = flowFalso();
  const { id } = await iniciarMembresia(env, "https://iceroom.example", datos);
  await env.PAYMENTS_DB.prepare("UPDATE membresias SET flow_customer = 'cus_otro' WHERE id = ?1").bind(id).run();
  assert.equal(await completarMembresia(env, id, "t"), "error");
  assert.equal(llamadas.some((l) => l.ruta === "/api/customer/charge"), false);
});

test("planes mensuales al precio normal y cobro mensual registrado una sola vez", async () => {
  const env = entorno(); const llamadas = flowFalso();
  const planes = await crearPlanesFlow(env, "https://iceroom.example");
  assert.equal(planes.length, 5);
  const ad = llamadas.find((l) => l.params.planId === "icycold-artist-dev");
  assert.equal(ad.params.amount, "189990");
  assert.equal(ad.params.interval, "3");
  assert.equal(ad.params.urlCallback, "https://iceroom.example/api/icycold-flow-cobro");
  await registrarCobroMensual(env, "x"); await registrarCobroMensual(env, "x");
  const n = await env.PAYMENTS_DB.prepare("SELECT COUNT(*) AS n FROM membresia_cobros").first();
  assert.equal(n.n, 1);
});

test("API: valida datos y devuelve la URL de Flow", async () => {
  const env = entorno(); flowFalso();
  const pedir = (body) => suscribir({ request: new Request("https://iceroom.example/api/icycold-suscribir", { method: "POST", body: JSON.stringify(body) }), env });
  assert.equal((await pedir({ plan: "mix-master", nombre: "Ana", email: "a@b.cl" })).status, 503, "cerrado sin planes en Flow");
  await crearPlanesFlow(env, "https://iceroom.example");
  assert.equal((await pedir({ plan: "nada", nombre: "Ana", email: "a@b.cl" })).status, 400);
  assert.equal((await pedir({ plan: "mix-master", nombre: "Ana", email: "malo" })).status, 400);
  const ok = await pedir({ plan: "mix-master", nombre: "Ana", email: "a@b.cl" });
  assert.equal(ok.status, 200);
  assert.match((await ok.json()).url, /token=tok1$/);
});

test("un mes después en Santiago, ajustando fin de mes", () => {
  assert.equal(unMesDespues(new Date("2026-01-31T15:00:00Z")), "2026-02-28");
  assert.equal(unMesDespues(new Date("2026-12-10T15:00:00Z")), "2027-01-10");
});
