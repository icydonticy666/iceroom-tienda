// Página del cliente: /proyecto?t=<token>. Todo lo que viene del servidor se pinta con textContent.
(() => {
  const $ = (id) => document.getElementById(id);
  const token = new URLSearchParams(location.search).get("t") || "";
  const PASOS = ["Material", "Producción", "Revisión", "Ajustes", "Entregado"];
  const INDICE = { esperando_material: 0, en_produccion: 1, revision_cliente: 2, ajuste: 3, completado: 4 };
  const QUIEN = { cliente: "Tú", icycold: "IC" };
  const TIPOS = {
    creado: "Proyecto creado", material: "Enviaste tu material", entrega: "Nueva versión entregada",
    ajuste: "Pediste ajustes", aprobado: "Aprobaste la versión", nota: "Nota", completado: "Proyecto completado",
    cancelado: "Proyecto cancelado",
  };

  function el(tag, props = {}, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
    }
    for (const h of hijos) if (h) n.append(h);
    return n;
  }
  function enlace(url, texto) {
    // Solo https: lo valida también el servidor.
    if (!/^https:\/\//i.test(url || "")) return null;
    return el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: texto || url });
  }
  function fecha(iso) {
    try { return new Date(iso).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }); }
    catch { return ""; }
  }
  function mostrar(id, si) { $(id).classList.toggle("pj-hidden", !si); }
  function mensaje(nodo, texto, tipo) { nodo.textContent = texto || ""; nodo.className = "pj-msg" + (tipo ? " " + tipo : ""); }

  async function api(metodo, datos) {
    const r = metodo === "GET"
      ? await fetch("/api/proyecto?t=" + encodeURIComponent(token), { cache: "no-store" })
      : await fetch("/api/proyecto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, ...datos }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "Algo falló. Intenta de nuevo."), { status: r.status });
    return j;
  }

  function pintar(v) {
    mostrar("cargando", false); mostrar("recuperar", false); mostrar("proyecto", true);
    document.title = `${v.servicio} #${v.id} · iceroom`;
    $("pj-ref").textContent = `${v.servicio} · proyecto #${v.id}`;
    $("pj-titulo").textContent = v.titulo;
    $("pj-detalle").textContent = v.detalle;

    const meta = $("pj-meta"); meta.replaceChildren();
    if (v.turno === "cliente") meta.append(el("span", { class: "pj-chip is-you", text: "Te toca a ti" }));
    if (v.turno === "icycold") meta.append(el("span", { class: "pj-chip", text: "Le toca a icycold" }));
    if (v.venceEn) meta.append(el("span", { class: "pj-chip" }, "Entrega estimada: ", el("b", { text: v.venceTexto })));
    if (v.rondas) meta.append(el("span", { class: "pj-chip", text: `Ajustes: ${v.rondasUsadas} de ${v.rondas}` }));
    if (v.version) meta.append(el("span", { class: "pj-chip", text: `Versión ${v.version}` }));

    const bar = $("pj-bar");
    bar.setAttribute("aria-valuenow", String(v.progreso));
    bar.firstElementChild.style.width = v.progreso + "%";
    const pasos = $("pj-steps"); pasos.replaceChildren();
    const actual = INDICE[v.estado];
    mostrar("pj-steps", actual !== undefined); mostrar("pj-bar", v.estado !== "cancelado");
    PASOS.forEach((nombre, i) => {
      const cls = actual === undefined ? "" : i < actual || v.estado === "completado" ? "done" : i === actual ? "now" : "";
      pasos.append(el("li", { class: cls, text: nombre }));
    });

    // Material
    const pideMaterial = v.acciones.includes("material");
    mostrar("bloque-material", pideMaterial);
    if (pideMaterial) {
      $("pj-pedido").replaceChildren(...v.pedido.map((t) => el("li", { text: t })));
      $("pj-plazo").textContent = v.plazo ? `Plazo de entrega: ${v.plazo} desde que recibimos tu material.` : "";
    }

    // Revisión
    const revisa = v.acciones.includes("aprobar");
    mostrar("bloque-revision", revisa);
    if (revisa) {
      const entrega = [...v.historial].reverse().find((e) => e.tipo === "entrega");
      $("rev-titulo").textContent = `Tu versión ${v.version} está lista`;
      const caja = $("rev-entrega"); caja.replaceChildren();
      const info = el("div", {}, el("b", { text: `Versión ${v.version}` }));
      if (entrega?.texto) info.append(el("span", { class: "pj-hint", text: entrega.texto }));
      caja.append(info);
      const link = entrega && enlace(entrega.enlace, "Descargar");
      if (link) { link.className = "pj-btn"; caja.append(link); }
      const puedeAjustar = v.acciones.includes("pedir_ajuste");
      mostrar("btn-ajuste", puedeAjustar);
      if (!puedeAjustar) mostrar("form-ajuste", false);
      const quedan = v.rondas - v.rondasUsadas;
      $("rev-rondas").textContent = puedeAjustar
        ? `Te ${quedan === 1 ? "queda 1 ronda" : `quedan ${quedan} rondas`} de ajustes. Al aprobar, el proyecto queda entregado.`
        : "Ya usaste las rondas de ajustes incluidas. Si necesitas algo más, escríbenos a soporte@iceroom.cl.";
    }

    mostrar("bloque-nota", v.acciones.includes("nota") && !pideMaterial);
    // Historial (más reciente arriba)
    const lista = $("pj-historial"); lista.replaceChildren();
    for (const e of [...v.historial].reverse()) {
      const cuerpo = el("div", {}, el("strong", { text: TIPOS[e.tipo] || e.tipo }), " ", el("time", { text: fecha(e.creado) }));
      if (e.texto) cuerpo.append(el("p", { text: e.texto }));
      const a = enlace(e.enlace); if (a) cuerpo.append(a);
      lista.append(el("li", {}, el("span", { class: "pj-who " + (e.quien || ""), text: QUIEN[e.quien] || "·", "aria-hidden": "true" }), cuerpo));
    }
    if (!v.historial.length) lista.append(el("li", { class: "pj-empty", text: "Aún no hay movimientos." }));
  }

  function datosDe(form) { return Object.fromEntries(new FormData(form).entries()); }

  async function enviar(form, accion, msgNodo, ok) {
    const boton = form.querySelector("button[type=submit]") || form;
    boton.disabled = true; mensaje(msgNodo, "Enviando…");
    try {
      pintar(await api("POST", { accion, ...(form.tagName === "FORM" ? datosDe(form) : {}) }));
      if (form.tagName === "FORM") form.reset();
      // El bloque del formulario puede ocultarse al cambiar de estado: el aviso va arriba.
      mensaje(msgNodo, "");
      mensaje($("pj-aviso"), ok, "ok");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      if (error.status === 404) return sinLink(error.message);
      mensaje(msgNodo, error.message, "error");
    } finally { boton.disabled = false; }
  }

  function sinLink(motivo) {
    mostrar("cargando", false); mostrar("proyecto", false); mostrar("recuperar", true);
    if (motivo) $("recuperar-motivo").textContent = motivo;
  }

  // Proyectos recordados en este dispositivo: volver es entrar a iceroom.cl → Mi proyecto.
  const GUARDA = "iceroom-proyectos";
  function guardados() {
    try { const l = JSON.parse(localStorage.getItem(GUARDA) || "[]"); return Array.isArray(l) ? l.filter((x) => x && x.t) : []; }
    catch { return []; }
  }
  function guardar(v) {
    try {
      const l = guardados().filter((x) => x.t !== token);
      l.unshift({ t: token, id: v.id, servicio: v.servicio, titulo: v.titulo, visto: new Date().toISOString() });
      localStorage.setItem(GUARDA, JSON.stringify(l.slice(0, 10)));
      mostrar("pj-guardado", true);
    } catch { /* sin almacenamiento: queda el link del correo */ }
  }
  function olvidar(t) {
    try { localStorage.setItem(GUARDA, JSON.stringify(guardados().filter((x) => x.t !== t))); } catch {}
  }
  function inicioSinToken() {
    const params = new URLSearchParams(location.search);
    const lista = guardados();
    if (params.get("compra")) {
      // Viene de la página de gracias de Payhip (PayPal): el link ya va en camino a su correo.
      $("recuperar-eyebrow").textContent = "Compra confirmada";
      $("recuperar-titulo").textContent = "¡Gracias! Tu proyecto ya está creado";
      $("recuperar-motivo").textContent = "Te mandamos el link de tu proyecto al correo de tu compra (revisa también spam). Ábrelo y quedará guardado aquí. ¿No te llegó en 2 minutos? Escribe tu correo y te lo mandamos de nuevo.";
    } else if (lista.length === 1 && !params.get("otro")) {
      location.replace("/proyecto?t=" + encodeURIComponent(lista[0].t));
      return;
    }
    if (lista.length) {
      $("lista-guardados").replaceChildren(...lista.map((x) => el("li", {},
        el("a", { href: "/proyecto?t=" + encodeURIComponent(x.t) },
          el("div", {}, el("b", { text: `${x.servicio} #${x.id}` }), el("small", { text: x.titulo || "" })),
          el("span", { "aria-hidden": "true", text: "→" })))));
      mostrar("guardados", true);
      $("recuperar-titulo").textContent = params.get("compra") ? $("recuperar-titulo").textContent : "¿Otro proyecto?";
    }
    sinLink();
  }

  $("form-material").addEventListener("submit", (ev) => {
    ev.preventDefault();
    enviar(ev.target, "material", ev.target.querySelector(".pj-msg"), "¡Recibido! Ya estamos trabajando en tu proyecto. Te avisamos por correo.");
  });
  $("btn-aprobar").addEventListener("click", (ev) => {
    if (!confirm("¿Aprobar esta versión? El proyecto quedará entregado y ya no se podrán pedir más ajustes.")) return;
    enviar(ev.currentTarget, "aprobar", $("rev-msg"), "¡Listo! Proyecto entregado. Gracias por confiar en iceroom.");
  });
  $("btn-ajuste").addEventListener("click", () => {
    mostrar("form-ajuste", true);
    $("form-ajuste").querySelector("textarea").focus();
  });
  $("form-ajuste").addEventListener("submit", (ev) => {
    ev.preventDefault();
    enviar(ev.target, "pedir_ajuste", $("rev-msg"), "Recibimos tus ajustes. Te avisamos cuando esté la nueva versión.");
  });
  $("form-nota").addEventListener("submit", (ev) => {
    ev.preventDefault();
    enviar(ev.target, "nota", ev.target.querySelector(".pj-msg"), "Nota enviada.");
  });
  $("form-recuperar").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target, msg = form.querySelector(".pj-msg"), boton = form.querySelector("button");
    boton.disabled = true; mensaje(msg, "Enviando…");
    try {
      const r = await fetch("/api/proyecto-enlace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(datosDe(form)) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo enviar. Intenta de nuevo.");
      mensaje(msg, j.mensaje, "ok"); form.reset();
    } catch (error) { mensaje(msg, error.message, "error"); }
    finally { boton.disabled = false; }
  });

  if (!token) return inicioSinToken();
  api("GET").then((v) => { pintar(v); guardar(v); }).catch((error) => {
    if (error.status === 404) { olvidar(token); return sinLink(error.message); }
    $("cargando").firstElementChild.textContent = error.message || "No pudimos cargar tu proyecto. Recarga la página.";
  });
})();
