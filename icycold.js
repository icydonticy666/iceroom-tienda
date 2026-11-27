// ICYCOLD (iceroom.cl/icycold): selector Chile/Internacional, postulación y animaciones de entrada.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const PLANES = {
    cl: [
      ["mix-master", "Mix & Master · $79.990 el primer mes"],
      ["recording-mix", "Recording + Mix · $109.990 el primer mes"],
      ["full-remoto", "Full Prod Remoto · $109.990 el primer mes"],
      ["full-presencial", "Full Prod Presencial · $139.990 el primer mes"],
      ["artist-dev", "Artist Development · $179.990 el primer mes"],
    ],
    int: [
      ["mix-master", "Mix & Master · desde US$65 / mes"],
      ["full-remoto", "Full Production · desde US$99 / mes"],
      ["artist-dev", "Artist Development · desde US$149 / mes"],
    ],
  };
  const PRECIO = { cl: { "mix-master": 89990, "recording-mix": 119990, "full-remoto": 119990, "full-presencial": 149990, "artist-dev": 189990 }, int: { "mix-master": 65, "full-remoto": 99, "artist-dev": 149 } };
  const clp = (n) => "$" + n.toLocaleString("es-CL");
  const form = $("#ic-form"), select = $("#ic-plan"), resumen = $("#ic-sum");
  let region = "cl";

  function llenarPlanes(elegido) {
    const actual = elegido || select.value;
    select.replaceChildren(...PLANES[region].map(([v, t]) => new Option(t, v)));
    if (PLANES[region].some(([v]) => v === actual)) select.value = actual;
    pintarResumen();
  }
  function pintarResumen() {
    const nombre = select.selectedOptions[0]?.text.split(" · ")[0] || "";
    const base = PRECIO[region][select.value];
    if (!base) { resumen.replaceChildren(); return; }
    const b = document.createElement("b"); b.textContent = nombre;
    if (region === "int") { resumen.replaceChildren(b, `Desde US$${base} al mes · remoto`); return; }
    const s = document.createElement("s"); s.textContent = clp(base);
    resumen.replaceChildren(b, s, `${clp(base - 10000)} el primer mes · luego ${clp(base)} / mes`);
  }
  select.addEventListener("change", pintarResumen);
  function ponerRegion(r, { plan } = {}) {
    region = r === "int" ? "int" : "cl";
    for (const b of $$(".ic-switch [data-region]")) b.setAttribute("aria-checked", String(b.dataset.region === region));
    for (const el of $$("[data-plans]")) el.hidden = el.dataset.plans !== region;
    for (const el of $$("[data-nota]")) el.hidden = el.dataset.nota !== region;
    const radio = form.querySelector(`input[name=region][value=${region}]`);
    if (radio) radio.checked = true;
    llenarPlanes(plan);
  }

  $$(".ic-switch [data-region]").forEach((b) => b.addEventListener("click", () => ponerRegion(b.dataset.region)));
  $(".ic-switch").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    ponerRegion(region === "cl" ? "int" : "cl");
    $(`.ic-switch [data-region=${region}]`).focus();
  });
  $$("input[name=region]", form).forEach((r) => r.addEventListener("change", () => ponerRegion(r.value)));
  $$("[data-elegir]").forEach((b) => b.addEventListener("click", () => {
    ponerRegion(region, { plan: b.dataset.elegir });
    $("#postular").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setTimeout(() => form.querySelector("[name=nombre]").focus({ preventScroll: true }), 500);
  }));

  // Región inicial: ?region=int, o el país del visitante (fuera de Chile → Internacional).
  const q = new URLSearchParams(location.search).get("region");
  ponerRegion(q === "int" ? "int" : "cl");
  if (!q) {
    fetch("/api/geo", { cache: "no-store" }).then((r) => r.json()).then(({ country }) => {
      if (country && country !== "CL") ponerRegion("int");
    }).catch(() => {});
  }

  // Barra fija con el precio: aparece pasado el inicio y se esconde en membresías, el formulario, el cierre y el pie.
  const barra = $(".ic-bar");
  if (barra) {
    const zonas = [".ic-hero", "#membresias .ic-plans", "#postular", ".ic-final", ".ic-foot"];
    let pendiente = false;
    const revisar = () => {
      pendiente = false;
      const alto = innerHeight;
      const tapada = zonas.some((sel) => $$(sel).some((el) => {
        if (el.hidden) return false;
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < alto;
      }));
      barra.classList.toggle("is-on", !tapada);
    };
    const pedir = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(revisar); } };
    addEventListener("scroll", pedir, { passive: true });
    addEventListener("resize", pedir);
    revisar();
  }

  // Reserva (postulación)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $(".ic-msg", form), boton = $("button[type=submit]", form);
    const datos = Object.fromEntries(new FormData(form).entries());
    msg.className = "ic-msg";
    $$("[aria-invalid]", form).forEach((el) => el.removeAttribute("aria-invalid"));
    const faltan = ["nombre", "email", "musica"].map((n) => form.elements[n]).filter((el) => !el.value.trim() || !el.checkValidity());
    if (faltan.length) {
      faltan.forEach((el) => el.setAttribute("aria-invalid", "true"));
      msg.className = "ic-msg error";
      msg.textContent = "Completa tu nombre, un correo válido y un link a tu música.";
      faltan[0].focus();
      return;
    }
    boton.disabled = true; msg.textContent = "Enviando…";
    try {
      const r = await fetch("/api/icycold-postulacion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(datos) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo enviar. Intenta de nuevo.");
      form.hidden = true;
      const listo = $("#ic-done"); listo.hidden = false; listo.focus();
    } catch (err) {
      msg.className = "ic-msg error"; msg.textContent = err.message;
    } finally { boton.disabled = false; }
  });

  // Animaciones de entrada
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
    const grupos = [".ic-hero-text > *", ".ic-stats > div", ".ic-head", ".ic-card", ".ic-tracks li", ".ic-steps li", ".ic-apply-side", ".ic-form", ".ic-faq details"];
    const io = new IntersectionObserver((entradas) => {
      for (const en of entradas) if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
    }, { rootMargin: "0px 0px -8% 0px" });
    for (const sel of grupos) $$(sel).forEach((el, i) => {
      if (el.classList.contains("ic-word")) return;
      el.dataset.rv = ""; el.style.setProperty("--d", `${Math.min(i, 6) * 0.07}s`); io.observe(el);
    });
    document.documentElement.classList.add("ic-anim");
  }
})();
