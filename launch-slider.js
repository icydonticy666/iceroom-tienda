// Slider de lanzamientos de la portada: flechas, puntos y teclado sobre un carrusel con scroll-snap.
(() => {
  const slider = document.querySelector("[data-launch-slider]");
  if (!slider) return;
  const track = slider.querySelector(".launch-track");
  const slides = [...track.children].filter((n) => n.classList.contains("launch-slide"));
  const nav = slider.querySelector(".launch-nav");
  if (slides.length < 2 || !nav) return;
  const dots = nav.querySelector(".launch-dots");
  const prev = nav.querySelector("[data-launch-prev]");
  const next = nav.querySelector("[data-launch-next]");
  const acentos = slides.map((s) => getComputedStyle(s).getPropertyValue("--lambo").trim());
  let actual = 0;

  const botones = slides.map((slide, i) => {
    slide.setAttribute("aria-label", `${i + 1} de ${slides.length}`);
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", `Ir al lanzamiento ${i + 1}`);
    b.addEventListener("click", () => ir(i));
    dots.append(b);
    return b;
  });

  function ir(i) {
    const n = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: slides[n].offsetLeft - slides[0].offsetLeft });
    // Los puntos cambian al tiro; el scroll (suave) los confirma al terminar.
    actual = n;
    botones.forEach((b, j) => b.setAttribute("aria-current", String(j === n)));
    nav.style.setProperty("--dot", acentos[n] || "#eee");
    prev.disabled = n === 0;
    next.disabled = n === slides.length - 1;
  }
  function marcar() {
    const paso = slides[1].offsetLeft - slides[0].offsetLeft || 1;
    actual = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / paso)));
    botones.forEach((b, i) => b.setAttribute("aria-current", String(i === actual)));
    nav.style.setProperty("--dot", acentos[actual] || "#eee");
    prev.disabled = actual === 0;
    next.disabled = actual === slides.length - 1;
  }

  prev.addEventListener("click", () => ir(actual - 1));
  next.addEventListener("click", () => ir(actual + 1));
  track.addEventListener("keydown", (e) => {
    if (e.target !== track) return;
    if (e.key === "ArrowRight") { e.preventDefault(); ir(actual + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); ir(actual - 1); }
  });
  let espera = 0;
  track.addEventListener("scroll", () => { cancelAnimationFrame(espera); espera = requestAnimationFrame(marcar); }, { passive: true });
  window.addEventListener("resize", marcar);
  // Arrastre con el mouse (en pantallas táctiles ya se desliza solo). No parte sobre botones ni enlaces.
  let arrastre = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('a, button, input, textarea, select')) return;
    arrastre = { x: e.clientX, left: track.scrollLeft, movido: false };
  });
  addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x;
    if (!arrastre.movido && Math.abs(dx) < 8) return;
    arrastre.movido = true;
    track.classList.add('is-dragging');
    track.scrollLeft = arrastre.left - dx;
  }, { passive: true });
  addEventListener('pointerup', () => {
    if (!arrastre) return;
    const movido = arrastre.movido, desde = arrastre.left;
    arrastre = null;
    if (!movido) return;
    const paso = slides[1].offsetLeft - slides[0].offsetLeft || 1;
    const delta = track.scrollLeft - desde;
    const base = Math.round(desde / paso);
    track.classList.remove('is-dragging');
    ir(Math.abs(delta) > 60 ? base + Math.sign(delta) : base);
    setTimeout(() => track.dispatchEvent(new Event('scroll')), 400);
  });
  track.addEventListener('dragstart', (e) => e.preventDefault());

  // Avance automático (11-nov-2026, para vender más): cada 7 s pasa al siguiente lanzamiento y al final vuelve
  // al primero. Se pausa con el cursor o el foco encima, fuera de pantalla, con la pestaña oculta o con una
  // ventana abierta (checkout, "cómo funciona"); se detiene del todo cuando el visitante usa flechas, puntos,
  // arrastra o desliza. Con "reducir movimiento" no avanza solo. El botón de pausa cumple WCAG 2.2.2.
  const DURA = 7000;
  const play = nav.querySelector('[data-launch-play]');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  let detenido = reducido.matches, encima = false, foco = false, enPantalla = false;
  let transcurrido = 0, ultimo = 0, reloj = 0;
  const bloqueado = () => encima || foco || document.hidden || Boolean(document.querySelector('dialog[open]'));
  function pintarAvance() {
    nav.dataset.auto = detenido ? 'off' : 'on';
    nav.style.setProperty('--avance', (transcurrido / DURA).toFixed(3));
    if (play) {
      play.dataset.estado = detenido ? 'pausado' : 'corriendo';
      play.setAttribute('aria-label', detenido ? 'Reanudar el carrusel' : 'Pausar el carrusel');
    }
  }
  // Reloj de 80 ms (no requestAnimationFrame: así también avanza donde el navegador frena los cuadros).
  function tic() {
    if (detenido || !enPantalla) { clearInterval(reloj); reloj = 0; ultimo = 0; return; }
    const t = performance.now();
    if (bloqueado()) { ultimo = 0; return; }
    if (ultimo) transcurrido += Math.min(t - ultimo, 250);
    ultimo = t;
    if (transcurrido >= DURA) {
      transcurrido = 0;
      marcar();
      ir(actual + 1 >= slides.length ? 0 : actual + 1);
    }
    pintarAvance();
  }
  function arrancar() { if (!reloj && !detenido && enPantalla) reloj = setInterval(tic, 80); }
  function detener() {
    if (detenido) return;
    detenido = true; transcurrido = 0;
    clearInterval(reloj); reloj = 0;
    pintarAvance();
  }
  [prev, next, ...botones].forEach((b) => b.addEventListener('click', detener));
  track.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') detener(); });
  track.addEventListener('touchstart', detener, { passive: true });
  track.addEventListener('wheel', (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) detener(); }, { passive: true });
  addEventListener('pointerup', () => { if (track.classList.contains('is-dragging')) detener(); }, { capture: true });
  slider.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') encima = true; });
  slider.addEventListener('pointerleave', () => { encima = false; });
  slider.addEventListener('focusin', () => { foco = true; });
  slider.addEventListener('focusout', (e) => { if (!slider.contains(e.relatedTarget)) foco = false; });
  if (play) {
    play.removeAttribute('aria-pressed');
    play.hidden = reducido.matches;
    play.addEventListener('click', () => {
      if (detenido) { detenido = false; transcurrido = 0; pintarAvance(); arrancar(); }
      else detener();
    });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      enPantalla = entries[0].isIntersecting;
      if (enPantalla) arrancar();
    }, { threshold: 0.5 }).observe(track);
  } else enPantalla = true;
  reducido.addEventListener('change', () => { if (reducido.matches) { detener(); if (play) play.hidden = true; } });

  nav.hidden = false;
  marcar();
  pintarAvance();
  arrancar();
})();

// Ventana "cómo funciona" del bundle Plantilla personalizada.
(() => {
  const dialog = document.getElementById("voz-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return;
  for (const b of document.querySelectorAll("[data-voz-open]")) b.addEventListener("click", () => dialog.showModal());
  dialog.querySelector("[data-voz-close]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  // El botón de la ventana usa el mismo de la tarjeta (checkout de la tienda, o DM mientras no hay compra).
  dialog.querySelector("[data-voz-buy]")?.addEventListener("click", () => {
    dialog.close();
    [...document.querySelectorAll("[data-voz-cta]")].find((a) => !a.hidden)?.click();
  });
  if (location.hash === "#como-funciona") dialog.showModal();
})();
