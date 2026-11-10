// Seguimiento de servicios (9-nov-2026): Plantilla a tu voz y Mezcla + Master.
// Cada compra crea un proyecto con un link privado (token aleatorio; en la base solo se guarda su hash).
// El cliente manda su material por enlace (WeTransfer, Drive…), icycold entrega versiones por enlace y
// el cliente aprueba o pide ajustes dentro de las rondas incluidas. Cada cambio avisa por correo.

const DIA = 86400000;

/** Servicios con seguimiento, por clave de producto de Payhip. */
export const SERVICIOS = {
  JXKg8: {
    servicio: "plantilla_voz",
    nombre: "Plantilla a tu voz",
    cosa: "tu plantilla",
    rondas: 1,
    plazo: { horas: 72 },
    plazoAjuste: { horas: 48 },
    pedido: [
      "Tu voz seca (acapella) de 30 a 60 segundos, grabada con tu micrófono: WAV de 24 bits, sin efectos.",
      "Tu programa y versión (FL Studio o Ableton Live).",
      "Tu micrófono e interfaz.",
      "1 a 3 canciones de referencia de cómo quieres sonar.",
    ],
  },
  z6Bgp: {
    servicio: "mix_master",
    nombre: "Mezcla + Master",
    cosa: "tu mezcla",
    rondas: 2,
    plazo: { habiles: 5 },
    plazoAjuste: { habiles: 3 },
    pedido: [
      "Las pistas separadas de la canción (stems) en WAV, todas desde el compás 1, sin efectos de master.",
      "El tempo (BPM) y la tonalidad, si los tienes.",
      "1 a 3 canciones de referencia.",
      "Notas sobre lo que buscas: estilo, partes importantes, efectos que quieres conservar.",
    ],
  },
  // Bundle Plantilla personalizada (10-nov-2026): plantilla a tu voz + presets de voz principal + los 5 Pritti +
  // SWAP Free (US$39.99). `bundle`: dentro trae JXKg8; si Payhip lo lista en la orden, no se crea un segundo proyecto.
  TGd6m: {
    servicio: "plantilla_personalizada",
    nombre: "Plantilla personalizada",
    cosa: "tu plantilla personalizada",
    bundle: true,
    rondas: 1,
    plazo: { horas: 72 },
    plazoAjuste: { horas: 48 },
    pedido: [
      "Tu voz seca (acapella) de 30 a 60 segundos, grabada con tu micrófono: WAV de 24 bits, sin efectos.",
      "Tu programa y versión (FL Studio o Ableton Live).",
      "Tu micrófono e interfaz.",
      "1 a 3 canciones de referencia de cómo quieres sonar.",
    ],
  },
  // +US$5 (US$44.99): la plantilla en FL Studio y Ableton, y SWAP Pro en vez de Free.
  "6Txiw": {
    servicio: "plantilla_personalizada",
    nombre: "Plantilla personalizada FL + Ableton",
    cosa: "tus plantillas personalizadas (FL Studio y Ableton)",
    bundle: true,
    rondas: 1,
    plazo: { horas: 72 },
    plazoAjuste: { horas: 48 },
    pedido: [
      "Tu voz seca (acapella) de 30 a 60 segundos, grabada con tu micrófono: WAV de 24 bits, sin efectos.",
      "Las versiones de FL Studio y Ableton Live que usas.",
      "Tu micrófono e interfaz.",
      "1 a 3 canciones de referencia de cómo quieres sonar.",
    ],
  },
};

export const FINALES = new Set(["completado", "cancelado"]);

export function servicioDe(productoKey) {
  return SERVICIOS[productoKey] || null;
}

// ─── Fechas ──────────────────────────────────────────────────────────────────

function diaSemana(fecha) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", weekday: "short" }).format(fecha);
}

/** Suma un plazo: horas corridas, o días hábiles (lunes a viernes, hora de Chile). */
export function sumarPlazo(desde, plazo) {
  const fecha = new Date(desde);
  if (plazo.horas) return new Date(fecha.getTime() + plazo.horas * 3600000);
  let contados = 0;
  while (contados < plazo.habiles) {
    fecha.setTime(fecha.getTime() + DIA);
    const dia = diaSemana(fecha);
    if (dia !== "Sat" && dia !== "Sun") contados++;
  }
  return fecha;
}

export function plazoTexto(plazo) {
  return plazo.horas ? `${plazo.horas} horas` : `${plazo.habiles} días hábiles`;
}

export function fechaLarga(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

// ─── Estados ─────────────────────────────────────────────────────────────────

export function turnoDe(estado) {
  if (estado === "esperando_material" || estado === "revision_cliente") return "cliente";
  if (estado === "en_produccion" || estado === "ajuste") return "icycold";
  return "";
}

/** Avance 0–100 según el paso: esperando, producción, versión 1, ajuste 1, versión 2… completado. */
export function progreso(p) {
  const servicio = servicioDe(p.producto);
  const ultimo = 2 * (servicio?.rondas || 1) + 3;
  let paso = 0;
  if (p.estado === "en_produccion") paso = 1;
  else if (p.estado === "revision_cliente") paso = 2 * Math.max(1, p.version);
  else if (p.estado === "ajuste") paso = 2 * p.rondas_usadas + 1;
  else if (p.estado === "completado") paso = ultimo;
  return Math.min(100, Math.round((paso / ultimo) * 100));
}

export function etiqueta(p) {
  const s = servicioDe(p.producto);
  switch (p.estado) {
    case "esperando_material": return { titulo: "Esperando tu material", detalle: `Mándanos el enlace con tu material para empezar ${s?.cosa || "tu proyecto"}.` };
    case "en_produccion": return { titulo: "En producción", detalle: `icycold está trabajando en ${s?.cosa || "tu proyecto"}.` };
    case "revision_cliente": return { titulo: `Versión ${p.version} lista para revisar`, detalle: "Escúchala y apruébala, o pide tus ajustes." };
    case "ajuste": return { titulo: `Aplicando tus ajustes (ronda ${p.rondas_usadas} de ${s?.rondas || 1})`, detalle: "icycold está trabajando en tus cambios." };
    case "completado": return { titulo: "Entregado", detalle: "Tu proyecto está terminado. Gracias por confiar en iceroom." };
    case "cancelado": return { titulo: "Cancelado", detalle: "Este proyecto fue cancelado." };
    default: return { titulo: p.estado, detalle: "" };
  }
}

// ─── Tokens e ids ────────────────────────────────────────────────────────────

function aleatorio(bytes) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b;
}

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function nuevaSal() {
  return base64url(aleatorio(12));
}

/** El link del cliente es estable: HMAC(ORDER_SECRET, id:sal). Cambiar la sal invalida el link anterior. */
export async function tokenDe(env, id, sal) {
  const secreto = String(env.ORDER_SECRET || "").trim();
  if (!secreto) throw new Error("falta-order-secret");
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firmaToken = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(`proyecto:${id}:${sal}`));
  return base64url(new Uint8Array(firmaToken).slice(0, 24));
}

export async function linkDe(env, p, origin) {
  return enlaceProyecto(origin, await tokenDe(env, p.id, p.token_sal));
}

function nuevoId() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...aleatorio(8)].map((n) => abc[n % abc.length]).join("");
}

export async function hashToken(token) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function enlaceProyecto(origin, token) {
  return `${String(origin || "https://iceroom.cl").replace(/\/$/, "")}/proyecto?t=${encodeURIComponent(token)}`;
}

/** Solo enlaces https (WeTransfer, Drive, Dropbox…); nada de javascript: ni archivos locales. */
export function enlaceValido(valor) {
  const texto = String(valor || "").trim();
  if (!texto || texto.length > 600) return "";
  try {
    const url = new URL(texto);
    return url.protocol === "https:" && url.hostname.includes(".") ? url.href : "";
  } catch { return ""; }
}

export function limpiarTexto(valor, max = 2000) {
  return String(valor || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

// ─── Base de datos ───────────────────────────────────────────────────────────

const ahoraIso = () => new Date().toISOString();

export async function buscarPorToken(db, token) {
  if (!token || String(token).length < 20) return null;
  return db.prepare("SELECT * FROM proyectos WHERE token_hash = ?").bind(await hashToken(token)).first();
}

export async function buscarPorId(db, id) {
  return db.prepare("SELECT * FROM proyectos WHERE id = ?").bind(String(id || "")).first();
}

export async function eventos(db, id) {
  const r = await db.prepare("SELECT quien, tipo, estado, texto, enlace, creado FROM proyecto_eventos WHERE proyecto_id = ? ORDER BY id").bind(id).all();
  return r.results || [];
}

async function evento(db, id, quien, tipo, estado, texto = "", enlace = "") {
  await db.prepare("INSERT INTO proyecto_eventos (proyecto_id, quien, tipo, estado, texto, enlace, creado) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, quien, tipo, estado, texto || null, enlace || null, ahoraIso()).run();
}

/** Cambia el link del proyecto (si se filtró). El anterior deja de funcionar. */
export async function cambiarEnlace(env, p) {
  const sal = nuevaSal();
  const hash = await hashToken(await tokenDe(env, p.id, sal));
  await env.PAYMENTS_DB.prepare("UPDATE proyectos SET token_sal = ?, token_hash = ?, actualizado = ? WHERE id = ?").bind(sal, hash, ahoraIso(), p.id).run();
  return { ...p, token_sal: sal, token_hash: hash };
}

/**
 * Crea el proyecto de una compra. Idempotente por (origen, pago): si el aviso de pago llega dos
 * veces devuelve el mismo proyecto. Devuelve { proyecto, nuevo }.
 */
export async function crearProyecto(env, { producto, email, nombre = "", origen, pago, prueba = false }) {
  const servicio = servicioDe(producto);
  const correo = String(email || "").trim().toLowerCase();
  if (!servicio || !correo || !origen || !pago) return null;
  const db = env.PAYMENTS_DB;
  const previo = await db.prepare("SELECT * FROM proyectos WHERE origen = ? AND pago = ?").bind(origen, String(pago)).first();
  if (previo) return { proyecto: previo, nuevo: false };
  const id = nuevoId();
  const sal = nuevaSal();
  const ahora = ahoraIso();
  const r = await db.prepare(
    "INSERT OR IGNORE INTO proyectos (id, token_hash, token_sal, servicio, producto, email, nombre, origen, pago, estado, prueba, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'esperando_material', ?, ?, ?)"
  ).bind(id, await hashToken(await tokenDe(env, id, sal)), sal, servicio.servicio, producto, correo, limpiarTexto(nombre, 80) || null, origen, String(pago), prueba ? 1 : 0, ahora, ahora).run();
  if (r.meta.changes !== 1) {
    // Otro aviso del mismo pago lo creó al mismo tiempo.
    const otro = await db.prepare("SELECT * FROM proyectos WHERE origen = ? AND pago = ?").bind(origen, String(pago)).first();
    return otro ? { proyecto: otro, nuevo: false } : null;
  }
  await evento(db, id, "sistema", "creado", "esperando_material", `Compra confirmada (${origen}).`);
  return { proyecto: await buscarPorId(db, id), nuevo: true };
}

/** Crea el proyecto y, si es nuevo, manda el correo de bienvenida con su link. Nunca lanza. */
export async function iniciarProyecto(env, datos, origin) {
  try {
    const r = await crearProyecto(env, datos);
    if (!r) return null;
    const link = await linkDe(env, r.proyecto, origin);
    if (r.nuevo) {
      // correo: false cuando el correo de la compra (pago en pesos) ya lleva el link del proyecto.
      if (datos.correo !== false) await enviarCorreo(env, {
        to: r.proyecto.email,
        subject: `Tu proyecto de ${servicioDe(r.proyecto.producto).nombre} está creado`,
        text: textoBienvenida(r.proyecto, link),
        prueba: Boolean(r.proyecto.prueba),
      });
      await avisarIcycold(env, r.proyecto, "Nueva compra", `Se creó el proyecto (${r.proyecto.origen}). Esperando el material del cliente.`);
    }
    return { ...r, link };
  } catch (error) {
    console.error(JSON.stringify({ proyecto_error: String(error?.message || error), origen: datos?.origen, pago: datos?.pago }));
    return null;
  }
}

export async function cancelarPorPago(env, origen, pago) {
  const db = env.PAYMENTS_DB;
  const p = await db.prepare("SELECT * FROM proyectos WHERE origen = ? AND pago = ?").bind(origen, String(pago)).first();
  if (!p || FINALES.has(p.estado)) return false;
  await db.prepare("UPDATE proyectos SET estado = 'cancelado', vence_en = NULL, actualizado = ? WHERE id = ?").bind(ahoraIso(), p.id).run();
  await evento(db, p.id, "sistema", "cancelado", "cancelado", "Pago reembolsado.");
  return true;
}

// ─── Correos ─────────────────────────────────────────────────────────────────

export function correoAvisos(env) {
  return String(env.ESTUDIO_AVISOS || "soporte@iceroom.cl").trim();
}

export async function enviarCorreo(env, { to, subject, text, prueba = false }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        reply_to: env.EMAIL_REPLY_TO || "soporte@iceroom.cl",
        to: [to],
        subject: (prueba ? "[PRUEBA] " : "") + subject,
        text,
      }),
    });
    if (!res.ok) console.error(JSON.stringify({ proyecto_correo_error: res.status, body: (await res.text()).slice(0, 200) }));
    return res.ok;
  } catch (error) {
    console.error(JSON.stringify({ proyecto_correo_error: String(error?.message || error) }));
    return false;
  }
}

const firma = "\n\n— icycold · iceroom\nResponde este correo si tienes cualquier duda.";

export function textoBienvenida(p, link) {
  const s = servicioDe(p.producto);
  return `¡Gracias por tu compra! Ya creamos tu proyecto de ${s.nombre} (#${p.id}).\n\n` +
    `Desde este link sigues todo: qué paso va, a quién le toca y cuándo recibes ${s.cosa}. Guárdalo:\n${link}\n\n` +
    `Para empezar, súbelo a WeTransfer, Google Drive o Dropbox y pega el enlace en tu proyecto:\n` +
    s.pedido.map((x) => `· ${x}`).join("\n") +
    `\n\nEl plazo de entrega (${plazoTexto(s.plazo)}) corre desde que recibimos tu material.` + firma;
}

async function avisarCliente(env, p, subject, cuerpo, link) {
  const extra = link ? `\n\nTu proyecto: ${link}` : `\n\nSi perdiste el link de tu proyecto, pídelo en https://iceroom.cl/proyecto con este correo.`;
  return enviarCorreo(env, { to: p.email, subject, text: cuerpo + extra + firma, prueba: Boolean(p.prueba) });
}

async function avisarIcycold(env, p, subject, cuerpo) {
  const origin = env.PUBLIC_ORIGIN || "https://iceroom.cl";
  return enviarCorreo(env, {
    to: correoAvisos(env),
    subject: `[Estudio] ${subject} · #${p.id}`,
    text: `${cuerpo}\n\nCliente: ${p.email}\nServicio: ${servicioDe(p.producto)?.nombre}\nPanel: ${String(origin).replace(/\/$/, "")}/estudio#${p.id}`,
    prueba: Boolean(p.prueba),
  });
}

// ─── Acciones ────────────────────────────────────────────────────────────────

class ErrorProyecto extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}
export { ErrorProyecto };

async function guardar(db, id, cambios) {
  const campos = Object.keys(cambios);
  await db.prepare(`UPDATE proyectos SET ${campos.map((c) => `${c} = ?`).join(", ")}, actualizado = ? WHERE id = ?`)
    .bind(...campos.map((c) => cambios[c]), ahoraIso(), id).run();
}

/** Acciones del cliente: material, aprobar, pedir_ajuste, nota. */
export async function accionCliente(env, p, datos, link = "") {
  const db = env.PAYMENTS_DB;
  const s = servicioDe(p.producto);
  const accion = String(datos?.accion || "");
  if (FINALES.has(p.estado) && accion !== "nota") throw new ErrorProyecto("Este proyecto ya está cerrado.");

  if (accion === "material") {
    if (p.estado !== "esperando_material") throw new ErrorProyecto("Tu material ya fue recibido. Si quieres agregar algo, déjalo como nota.");
    const enlace = enlaceValido(datos.enlace);
    if (!enlace) throw new ErrorProyecto("Pega un enlace válido (que empiece con https://) de WeTransfer, Google Drive o Dropbox.");
    const detalle = [
      datos.programa && `Programa: ${limpiarTexto(datos.programa, 120)}`,
      datos.equipo && `Micrófono / interfaz: ${limpiarTexto(datos.equipo, 160)}`,
      datos.referencias && `Referencias: ${limpiarTexto(datos.referencias, 600)}`,
      datos.notas && `Notas: ${limpiarTexto(datos.notas, 1500)}`,
    ].filter(Boolean).join("\n");
    const vence = sumarPlazo(new Date(), s.plazo).toISOString();
    await guardar(db, p.id, { estado: "en_produccion", vence_en: vence });
    await evento(db, p.id, "cliente", "material", "en_produccion", detalle, enlace);
    const nuevo = { ...p, estado: "en_produccion", vence_en: vence };
    await avisarCliente(env, nuevo, `Recibimos tu material · ${s.nombre}`,
      `Recibimos tu material y ${s.cosa} ya está en producción.\nEntrega estimada: ${fechaLarga(vence)} (hora de Chile).`, link);
    await avisarIcycold(env, nuevo, "Material recibido", `Llegó el material. Entregar antes del ${fechaLarga(vence)}.\nEnlace: ${enlace}\n\n${detalle}`);
    return nuevo;
  }

  if (accion === "aprobar") {
    if (p.estado !== "revision_cliente") throw new ErrorProyecto("No hay una versión pendiente de aprobar.");
    await guardar(db, p.id, { estado: "completado", vence_en: null });
    await evento(db, p.id, "cliente", "aprobado", "completado", limpiarTexto(datos.texto, 1000));
    const nuevo = { ...p, estado: "completado", vence_en: null };
    await avisarCliente(env, nuevo, `¡Listo! ${s.nombre} entregado`,
      `Aprobaste la versión ${p.version}: tu proyecto quedó entregado. Gracias por confiar en iceroom.\n\nLos enlaces de entrega siguen en tu proyecto.`, link);
    await avisarIcycold(env, nuevo, "Proyecto aprobado", `El cliente aprobó la versión ${p.version}.${datos.texto ? `\nComentario: ${limpiarTexto(datos.texto, 1000)}` : ""}`);
    return nuevo;
  }

  if (accion === "pedir_ajuste") {
    if (p.estado !== "revision_cliente") throw new ErrorProyecto("No hay una versión pendiente de revisar.");
    if (p.rondas_usadas >= s.rondas) throw new ErrorProyecto(`Ya usaste ${s.rondas === 1 ? "tu ronda" : `tus ${s.rondas} rondas`} de ajustes incluidas. Escríbenos a soporte@iceroom.cl y vemos una ronda extra.`);
    const texto = limpiarTexto(datos.texto, 3000);
    if (texto.length < 5) throw new ErrorProyecto("Cuéntanos qué quieres cambiar.");
    const enlace = enlaceValido(datos.enlace);
    const ronda = p.rondas_usadas + 1;
    const vence = sumarPlazo(new Date(), s.plazoAjuste).toISOString();
    await guardar(db, p.id, { estado: "ajuste", rondas_usadas: ronda, vence_en: vence });
    await evento(db, p.id, "cliente", "ajuste", "ajuste", texto, enlace);
    const nuevo = { ...p, estado: "ajuste", rondas_usadas: ronda, vence_en: vence };
    await avisarCliente(env, nuevo, `Recibimos tus ajustes · ${s.nombre}`,
      `Recibimos tus ajustes (ronda ${ronda} de ${s.rondas}).\nNueva versión estimada: ${fechaLarga(vence)} (hora de Chile).`, link);
    await avisarIcycold(env, nuevo, `Ajustes pedidos (ronda ${ronda})`, `Entregar antes del ${fechaLarga(vence)}.\n\n${texto}${enlace ? `\nEnlace: ${enlace}` : ""}`);
    return nuevo;
  }

  if (accion === "nota") {
    const texto = limpiarTexto(datos.texto, 2000);
    const enlace = enlaceValido(datos.enlace);
    if (!texto && !enlace) throw new ErrorProyecto("Escribe una nota o pega un enlace.");
    await evento(db, p.id, "cliente", "nota", p.estado, texto, enlace);
    await avisarIcycold(env, p, "Nota del cliente", `${texto}${enlace ? `\nEnlace: ${enlace}` : ""}`);
    return p;
  }

  throw new ErrorProyecto("Acción no válida.");
}

/** Acciones de icycold desde el panel: entregar, nota, completar, cancelar, reenviar_enlace, cambiar_enlace. */
export async function accionEstudio(env, p, datos, origin) {
  const db = env.PAYMENTS_DB;
  const s = servicioDe(p.producto);
  const accion = String(datos?.accion || "");
  if (FINALES.has(p.estado) && !["nota", "reenviar_enlace", "cambiar_enlace"].includes(accion)) throw new ErrorProyecto("El proyecto está cerrado.");

  if (accion === "entregar") {
    if (!["en_produccion", "ajuste"].includes(p.estado)) throw new ErrorProyecto("Solo se entrega cuando el proyecto está en producción o en ajustes.");
    const enlace = enlaceValido(datos.enlace);
    if (!enlace) throw new ErrorProyecto("Falta el enlace de la entrega (https://).");
    const texto = limpiarTexto(datos.texto, 3000);
    const version = p.version + 1;
    await guardar(db, p.id, { estado: "revision_cliente", version, vence_en: null });
    await evento(db, p.id, "icycold", "entrega", "revision_cliente", texto, enlace);
    const nuevo = { ...p, estado: "revision_cliente", version, vence_en: null };
    const quedan = s.rondas - p.rondas_usadas;
    const link = await linkDe(env, p, origin);
    await avisarCliente(env, nuevo, `Tu versión ${version} está lista · ${s.nombre}`,
      `Ya está lista la versión ${version} de ${s.cosa}.\nDescárgala: ${enlace}${texto ? `\n\nNota de icycold:\n${texto}` : ""}\n\n` +
      (quedan > 0 ? `Si te gusta, apruébala en tu proyecto. Si quieres cambios, te quedan ${quedan} ${quedan === 1 ? "ronda" : "rondas"} de ajustes.` : "Revísala y apruébala en tu proyecto."), link);
    return nuevo;
  }

  if (accion === "nota") {
    const texto = limpiarTexto(datos.texto, 3000);
    const enlace = enlaceValido(datos.enlace);
    if (!texto && !enlace) throw new ErrorProyecto("Escribe una nota o pega un enlace.");
    await evento(db, p.id, "icycold", "nota", p.estado, texto, enlace);
    if (datos.avisar) {
      const link = await linkDe(env, p, origin);
      await avisarCliente(env, p, `Novedades de tu proyecto · ${s.nombre}`, `icycold te dejó una nota:\n${texto}${enlace ? `\n${enlace}` : ""}`, link);
    }
    return p;
  }

  if (accion === "completar" || accion === "cancelar") {
    const estado = accion === "completar" ? "completado" : "cancelado";
    await guardar(db, p.id, { estado, vence_en: null });
    await evento(db, p.id, "icycold", estado, estado, limpiarTexto(datos.texto, 1000));
    return { ...p, estado, vence_en: null };
  }

  if (accion === "reenviar_enlace" || accion === "cambiar_enlace") {
    // cambiar_enlace: si el link se filtró, se genera uno nuevo y el anterior deja de funcionar.
    const actual = accion === "cambiar_enlace" ? await cambiarEnlace(env, p) : p;
    const link = await linkDe(env, actual, origin);
    await evento(db, p.id, "icycold", "enlace", p.estado, accion === "cambiar_enlace" ? "Se cambió el link del proyecto." : "Se reenvió el link del proyecto.");
    await avisarCliente(env, actual, `Tu proyecto · ${s.nombre}`, accion === "cambiar_enlace"
      ? `Este es el nuevo link de tu proyecto #${p.id}. El anterior dejó de funcionar.` : `Este es el link de tu proyecto #${p.id}.`, link);
    return actual;
  }

  throw new ErrorProyecto("Acción no válida.");
}

/** "Perdí mi link": manda links nuevos a todos los proyectos abiertos de ese correo (máx. 3 por hora). */
export async function enviarEnlaces(env, email, origin) {
  const db = env.PAYMENTS_DB;
  const correo = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return false;
  const r = await db.prepare("SELECT * FROM proyectos WHERE email = ? AND estado != 'cancelado' ORDER BY creado DESC LIMIT 5").bind(correo).all();
  const lista = r.results || [];
  if (!lista.length) return false;
  const hace1h = new Date(Date.now() - 3600000).toISOString();
  const usados = await db.prepare("SELECT COUNT(*) AS n FROM proyecto_eventos WHERE proyecto_id = ? AND tipo = 'enlace' AND creado > ?").bind(lista[0].id, hace1h).first();
  if (Number(usados?.n || 0) >= 3) return false;
  const lineas = [];
  for (const p of lista) {
    const link = await linkDe(env, p, origin);
    await evento(db, p.id, "cliente", "enlace", p.estado, "Pidió su link por correo.");
    lineas.push(`· ${servicioDe(p.producto)?.nombre || p.producto} (#${p.id}): ${link}`);
  }
  await enviarCorreo(env, {
    to: correo,
    subject: "Tus proyectos en iceroom",
    text: `Estos son los links de tus proyectos en iceroom:\n\n${lineas.join("\n")}${firma}`,
    prueba: lista.every((p) => p.prueba),
  });
  return true;
}

/** Lo que ve el cliente (sin correo completo ni datos internos). */
export async function vistaCliente(db, p) {
  const s = servicioDe(p.producto);
  const historial = (await eventos(db, p.id)).filter((e) => e.tipo !== "enlace");
  const acciones = [];
  if (p.estado === "esperando_material") acciones.push("material");
  if (p.estado === "revision_cliente") {
    acciones.push("aprobar");
    if (p.rondas_usadas < s.rondas) acciones.push("pedir_ajuste");
  }
  if (!FINALES.has(p.estado) || p.estado === "completado") acciones.push("nota");
  return {
    id: p.id,
    servicio: s?.nombre || p.producto,
    estado: p.estado,
    ...etiqueta(p),
    turno: turnoDe(p.estado),
    progreso: progreso(p),
    venceEn: p.vence_en,
    venceTexto: fechaLarga(p.vence_en),
    version: p.version,
    rondas: s?.rondas || 0,
    rondasUsadas: p.rondas_usadas,
    plazo: s ? plazoTexto(s.plazo) : "",
    pedido: s?.pedido || [],
    acciones,
    historial,
    creado: p.creado,
  };
}
