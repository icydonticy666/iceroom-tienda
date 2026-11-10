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
  nav.hidden = false;
  marcar();
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
