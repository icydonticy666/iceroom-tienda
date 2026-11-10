// Panel de icycold (/estudio). La clave vive solo en sessionStorage de esta pestaña.
(() => {
  const $ = (id) => document.getElementById(id);
  const CLAVE = "iceroom-estudio";
  const FINALES = new Set(["completado", "cancelado"]);
  const TIPOS = {
    creado: "Proyecto creado", material: "Material recibido", entrega: "Entrega", ajuste: "Ajustes pedidos",
    aprobado: "Aprobado por el cliente", nota: "Nota", completado: "Completado", cancelado: "Cancelado", enlace: "Link",
  };
  let clave = "";
  try { clave = sessionStorage.getItem(CLAVE) || ""; } catch {}
  let lista = [], filtro = "icycold", actual = null;

  function el(tag, props = {}, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
    }
    for (const h of hijos) if (h) n.append(h);
    return n;
  }
  const mostrar = (id, si) => $(id).classList.toggle("pj-hidden", !si);
  const fecha = (iso) => iso ? new Date(iso).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }) : "—";
  function mensaje(nodo, texto, tipo) { nodo.textContent = texto || ""; nodo.className = "pj-msg" + (tipo ? " " + tipo : ""); }

  async function api(metodo, datos, query = "") {
    const r = await fetch("/api/estudio" + query, {
      method: metodo, cache: "no-store",
      headers: { authorization: "Bearer " + clave, ...(datos ? { "content-type": "application/json" } : {}) },
      body: datos ? JSON.stringify(datos) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { salir(); throw new Error(j.error || "Clave incorrecta."); }
    if (!r.ok) throw new Error(j.error || "Algo falló.");
    return j;
  }

  function salir() {
    clave = ""; try { sessionStorage.removeItem(CLAVE); } catch {}
    mostrar("panel", false); mostrar("salir", false); mostrar("login", true);
  }

  function vista(nombre) {
    for (const v of ["vista-lista", "vista-nuevo", "vista-detalle"]) mostrar(v, v === nombre);
    window.scrollTo({ top: 0 });
  }

  async function cargarLista() {
    const j = await api("GET");
    lista = j.proyectos || [];
    // Primera carga: si no te toca nada, muestra lo que espera al cliente.
    if (!cargarLista.hecho) {
      cargarLista.hecho = true;
      if (!lista.some((p) => !FINALES.has(p.estado) && p.turno === "icycold")) filtro = "cliente";
    }
    $("sel-servicio").replaceChildren(...(j.servicios || []).map((s) => el("option", { value: s.key, text: s.nombre })));
    pintarLista();
  }

  function pintarLista() {
    const filas = lista.filter((p) => filtro === "todos" ? true
      : filtro === "cerrados" ? FINALES.has(p.estado)
      : !FINALES.has(p.estado) && p.turno === filtro);
    const tbody = $("filas"); tbody.replaceChildren();
    const ahora = Date.now();
    for (const p of filas) {
      const tarde = p.venceEn && !FINALES.has(p.estado) && new Date(p.venceEn).getTime() < ahora;
      const servicio = el("td", { text: p.servicio });
      if (p.prueba) servicio.append(el("span", { class: "es-test", text: "PRUEBA" }));
      const tr = el("tr", { tabindex: "0" },
        el("td", { text: String(p.id) }), servicio,
        el("td", { class: "es-hide", text: p.nombre ? `${p.nombre} · ${p.email}` : p.email }),
        el("td", { text: p.titulo }),
        el("td", { class: tarde ? "es-late" : "", text: tarde ? "Atrasado · " + fecha(p.venceEn) : fecha(p.venceEn) }));
      tr.addEventListener("click", () => abrir(p.id));
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") abrir(p.id); });
      tbody.append(tr);
    }
    mostrar("vacio", !filas.length);
    for (const b of document.querySelectorAll("[data-filtro]")) b.setAttribute("aria-pressed", String(b.dataset.filtro === filtro));
  }

  async function abrir(id) {
    mensaje($("d-msg"), "");
    pintarDetalle(await api("GET", null, "?id=" + encodeURIComponent(id)));
    vista("vista-detalle");
  }

  function pintarDetalle(p) {
    actual = p;
    $("d-ref").textContent = `${p.servicio} · #${p.id} · ${p.origen}${p.prueba ? " · PRUEBA" : ""}`;
    $("d-titulo").textContent = p.titulo;
    $("d-cliente").textContent = p.nombre ? `${p.nombre} · ${p.email}` : p.email;
    const meta = $("d-meta"); meta.replaceChildren();
    if (p.turno) meta.append(el("span", { class: "pj-chip" + (p.turno === "icycold" ? " is-you" : ""), text: p.turno === "icycold" ? "Te toca" : "Esperando al cliente" }));
    if (p.venceEn) meta.append(el("span", { class: "pj-chip" }, "Vence: ", el("b", { text: fecha(p.venceEn) })));
    meta.append(el("span", { class: "pj-chip", text: `Versión ${p.version} · ajustes ${p.rondasUsadas}/${p.rondas}` }));
    meta.append(el("span", { class: "pj-chip", text: `Creado ${fecha(p.creado)}` }));

    const entrega = ["en_produccion", "ajuste"].includes(p.estado);
    mostrar("d-entregar", entrega);
    $("d-entregar-titulo").textContent = `Entregar versión ${p.version + 1}`;
    mostrar("d-eliminar", p.prueba);
    for (const b of document.querySelectorAll('[data-accion="completar"],[data-accion="cancelar"]')) b.disabled = FINALES.has(p.estado);

    const ol = $("d-historial"); ol.replaceChildren();
    for (const e of [...(p.historial || [])].reverse()) {
      const cuerpo = el("div", {}, el("strong", { text: TIPOS[e.tipo] || e.tipo }), " ", el("time", { text: fecha(e.creado) }));
      if (e.texto) cuerpo.append(el("p", { text: e.texto }));
      if (/^https:\/\//i.test(e.enlace || "")) cuerpo.append(el("a", { href: e.enlace, target: "_blank", rel: "noopener noreferrer", text: e.enlace }));
      ol.append(el("li", {}, el("span", { class: "pj-who " + (e.quien || ""), text: e.quien === "icycold" ? "IC" : "CL" }), cuerpo));
    }
  }

  async function accion(datos, boton, ok) {
    const msg = $("d-msg");
    if (boton) boton.disabled = true;
    mensaje(msg, "Guardando…");
    try {
      const r = await api("POST", { id: actual.id, ...datos });
      if (datos.accion === "eliminar") { await cargarLista(); vista("vista-lista"); return true; }
      pintarDetalle(r);
      mensaje(msg, ok, "ok");
      cargarLista().catch(() => {});
      return true;
    } catch (error) { mensaje(msg, error.message, "error"); return false; }
    finally { if (boton) boton.disabled = false; window.scrollTo({ top: 0, behavior: "smooth" }); }
  }

  const CONFIRMAR = {
    completar: "¿Marcar como completado? El cliente ya no podrá pedir ajustes.",
    cancelar: "¿Cancelar el proyecto? (No reembolsa el pago.)",
    cambiar_enlace: "¿Generar un link nuevo? El actual deja de funcionar y se manda el nuevo por correo.",
    reenviar_enlace: "¿Reenviar el link al correo del cliente?",
    eliminar: "¿Eliminar este proyecto de prueba y su historial?",
  };
  const HECHO = {
    completar: "Proyecto completado.", cancelar: "Proyecto cancelado.", cambiar_enlace: "Link nuevo enviado al cliente.",
    reenviar_enlace: "Link reenviado.", eliminar: "Eliminado.",
  };
  for (const b of document.querySelectorAll("[data-accion]")) {
    b.addEventListener("click", () => {
      const a = b.dataset.accion;
      if (CONFIRMAR[a] && !confirm(CONFIRMAR[a])) return;
      accion({ accion: a }, b, HECHO[a]);
    });
  }

  $("form-entregar").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const datos = Object.fromEntries(new FormData(ev.target).entries());
    if (await accion({ accion: "entregar", ...datos }, ev.target.querySelector("button"), "Entregado. Se le avisó al cliente.")) ev.target.reset();
  });
  $("form-nota").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const datos = { accion: "nota", texto: f.get("texto"), enlace: f.get("enlace"), avisar: f.get("avisar") === "on" };
    if (await accion(datos, ev.target.querySelector("button"), datos.avisar ? "Nota guardada y enviada al cliente." : "Nota guardada.")) ev.target.reset();
  });
  $("copiar").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(actual.link); mensaje($("d-msg"), "Link copiado.", "ok"); }
    catch { prompt("Link del cliente:", actual.link); }
  });

  $("form-nuevo").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), msg = ev.target.querySelector(".pj-msg"), boton = ev.target.querySelector("button[type=submit]");
    boton.disabled = true; mensaje(msg, "Creando…");
    try {
      const r = await api("POST", { accion: "crear", producto: f.get("producto"), email: f.get("email"), nombre: f.get("nombre"), prueba: f.get("prueba") === "on" });
      ev.target.reset(); mensaje(msg, "");
      await cargarLista();
      await abrir(r.id);
      mensaje($("d-msg"), "Proyecto creado y link enviado al cliente.", "ok");
    } catch (error) { mensaje(msg, error.message, "error"); }
    finally { boton.disabled = false; }
  });

  for (const b of document.querySelectorAll("[data-filtro]")) b.addEventListener("click", () => { filtro = b.dataset.filtro; pintarLista(); });
  for (const b of document.querySelectorAll("[data-volver]")) b.addEventListener("click", () => vista("vista-lista"));
  $("nuevo").addEventListener("click", () => vista("vista-nuevo"));
  $("recargar").addEventListener("click", () => cargarLista().catch((e) => alert(e.message)));
  $("salir").addEventListener("click", salir);

  async function entrar() {
    mostrar("login", false); mostrar("panel", true); mostrar("salir", true);
    await cargarLista();
    vista("vista-lista");
  }

  $("form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = ev.target.querySelector(".pj-msg");
    clave = String(new FormData(ev.target).get("clave") || "").trim();
    mensaje(msg, "Entrando…");
    try {
      await entrar();
      try { sessionStorage.setItem(CLAVE, clave); } catch {}
      ev.target.reset(); mensaje(msg, "");
    } catch (error) { mensaje(msg, error.message, "error"); }
  });

  if (clave) entrar().catch(() => salir()); else salir();
})();
