// Capa de movimiento de la portada (11-nov-2026). Mejora progresiva: sin JS, o si el visitante pidió
// "reducir movimiento", el contenido se ve completo y quieto.
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.wrap > header');

  // Cabecera compacta al bajar (no es animación: solo estado).
  let pending = 0;
  const bar = document.createElement('div');
  bar.className = 'scroll-progress'; bar.setAttribute('aria-hidden', 'true');
  document.body.prepend(bar);
  const nativeProgress = window.CSS && CSS.supports('animation-timeline: scroll()');
  function onScroll() {
    pending = 0;
    header?.classList.toggle('is-scrolled', scrollY > 48);
    if (!nativeProgress) {
      const max = root.scrollHeight - innerHeight;
      bar.style.setProperty('--progress', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : '0');
    }
  }
  addEventListener('scroll', () => { if (!pending) pending = requestAnimationFrame(onScroll); }, { passive: true });
  onScroll();

  if (reduced.matches || !('IntersectionObserver' in window)) return;
  root.classList.add('motion-ok');

  // Entradas escalonadas: cada grupo aparece hijo por hijo cuando entra a la pantalla.
  const grupos = [
    ['.launch-slide .riri-copy', (el) => el.children, ''],
    ['.voz-art', (el) => el.querySelectorAll('.voz-item'), 'side'],
    ['.pack-art-grid', (el) => el.children, 'pop'],
    ['.pack-inventory', (el) => el.children, ''],
    ['.faq-items', (el) => el.children, ''],
    ['.about-wrap', (el) => [el.querySelector('.about-photo'), ...(el.querySelector('.about-text')?.children || [])], ''],
    ['footer', (el) => el.children, ''],
  ];
  const entrada = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      // Si ya quedó arriba de la pantalla (salto por un enlace), se muestra sin esperar.
      if (!entry.isIntersecting && entry.boundingClientRect.bottom > 0) continue;
      entry.target.classList.add('is-in');
      entrada.unobserve(entry.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
  for (const [selector, hijos, tipo] of grupos) {
    for (const grupo of document.querySelectorAll(selector)) {
      const items = [...hijos(grupo)].filter(Boolean);
      if (!items.length) continue;
      grupo.setAttribute('data-stagger', tipo);
      items.forEach((item, i) => { item.setAttribute('data-si', ''); item.style.setProperty('--i', Math.min(i, 9)); });
      entrada.observe(grupo);
    }
  }

  // Luz que sigue al cursor en las tarjetas grandes.
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    for (const card of document.querySelectorAll('.launch-slide, .setup-card')) {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
      }, { passive: true });
    }
  }

  // Cifras de "Sobre mí": cuentan hasta su valor la primera vez que se ven.
  const cifras = document.querySelector('.about-metrics');
  if (cifras) {
    new IntersectionObserver((entries, obs) => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      for (const strong of cifras.querySelectorAll('strong')) {
        const m = /^(\d+)(.*)$/.exec(strong.textContent.trim());
        if (!m) continue;
        const final = Number(m[1]), sufijo = m[2], inicio = performance.now(), dura = 1300;
        const paso = (t) => {
          const p = Math.min(1, (t - inicio) / dura), e = 1 - Math.pow(1 - p, 3);
          strong.textContent = Math.round(final * e) + sufijo;
          if (p < 1) requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
      }
    }, { threshold: 0.6 }).observe(cifras);
  }

  // Categorías: el panel que se muestra entra con un fundido corto.
  const paneles = [...document.querySelectorAll('.cat')];
  if (paneles.length && 'MutationObserver' in window) {
    const mo = new MutationObserver((cambios) => {
      for (const c of cambios) {
        const p = c.target;
        if (p.hidden || p.getAttribute('role') !== 'tabpanel') continue;
        p.classList.remove('tab-enter'); void p.offsetWidth; p.classList.add('tab-enter');
      }
    });
    paneles.forEach((p) => mo.observe(p, { attributes: true, attributeFilter: ['hidden'] }));
  }

  reduced.addEventListener('change', () => { if (reduced.matches) root.classList.remove('motion-ok'); });
})();
