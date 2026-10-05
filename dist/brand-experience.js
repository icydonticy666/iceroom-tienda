(() => {
  'use strict';
  const hero = document.getElementById('contenido');
  const canvas = document.getElementById('brand-snow');
  const word = hero?.querySelector('.hero-word');
  const control = document.getElementById('hero-motion');
  if (!hero || !canvas || !word || !control) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover:hover) and (pointer:fine)');
  let width = 0, height = 0, particles = [], rings = [];
  let frame = 0, last = 0, visible = false, paused = false;
  const pointer = {x: 0, y: 0, active: false};

  // Ported from index.php: clipped letters and the original diamond enter together.
  if (!reduced.matches) {
    const letters = [...word.textContent].map((letter, index) => {
      const outer = document.createElement('span'); outer.className = 'brand-letter';
      const inner = document.createElement('span'); inner.textContent = letter;
      inner.style.setProperty('--letter-index', index); outer.append(inner); return outer;
    });
    word.replaceChildren(...letters);
  }

  function flake(fromTop = false) {
    return {x: Math.random() * width, y: fromTop ? -12 : Math.random() * height,
      r: .6 + Math.random() * 1.65, speed: 10 + Math.random() * 18,
      drift: (Math.random() - .5) * 8, phase: Math.random() * 6.28,
      opacity: .15 + Math.random() * .38, accent: Math.random() < .22};
  }
  function resize() {
    const bounds = hero.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({length: width < 680 ? 34 : 68}, () => flake());
    rings = [];
    paint(0);
  }
  function diamond(x, y, size, opacity) {
    context.save(); context.translate(x, y); context.scale(size / 84, size / 84);
    context.beginPath(); context.moveTo(-26, -40); context.lineTo(26, -40);
    context.lineTo(42, -14); context.lineTo(0, 41); context.lineTo(-42, -14); context.closePath();
    context.lineWidth = 84 / size; context.strokeStyle = `rgba(148,132,252,${opacity})`;
    context.stroke(); context.restore();
  }
  function paint(delta) {
    context.clearRect(0, 0, width, height);
    for (let index = 0; index < particles.length; index++) {
      const p = particles[index]; p.phase += delta * .7;
      p.y += p.speed * delta; p.x += (p.drift + Math.sin(p.phase) * 7) * delta;
      if (pointer.active && delta) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y, distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < 100) {
          const force = (1 - distance / 100) * 48 * delta;
          p.x += dx / distance * force; p.y += dy / distance * force;
        }
      }
      if (p.y > height + 12) {particles[index] = flake(true); continue;}
      if (p.x < -12) p.x = width + 12; if (p.x > width + 12) p.x = -12;
      context.fillStyle = p.accent ? `rgba(183,170,255,${p.opacity})` : `rgba(245,244,241,${p.opacity})`;
      if (p.accent && p.r > 1.4) {
        context.save(); context.translate(p.x, p.y); context.rotate(Math.PI / 4);
        context.fillRect(-p.r, -p.r, p.r * 2, p.r * 2); context.restore();
      } else {context.beginPath(); context.arc(p.x, p.y, p.r, 0, Math.PI * 2); context.fill();}
    }
    rings = rings.filter(ring => ring.age < 1.6);
    rings.forEach(ring => {ring.age += delta; diamond(ring.x, ring.y, 24 + ring.age * 125, .34 * (1 - ring.age / 1.6));});
  }
  function tick(time) {
    frame = requestAnimationFrame(tick);
    if (time - last < 32) return; // A calm 30 fps saves work on high-refresh screens.
    const delta = last ? Math.min((time - last) / 1000, .06) : 0;
    last = time; paint(delta);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    const running = visible && !document.hidden && !paused && !reduced.matches;
    canvas.dataset.state = reduced.matches ? 'reduced' : paused ? 'paused' : running ? 'running' : 'offscreen';
    control.hidden = reduced.matches;
    control.setAttribute('aria-pressed', String(paused));
    control.setAttribute('aria-label', paused ? 'Reanudar animación del fondo' : 'Pausar animación del fondo');
    if (running) frame = requestAnimationFrame(tick);
    if (reduced.matches) {context.clearRect(0, 0, width, height); hero.style.removeProperty('--brand-y'); hero.style.removeProperty('--brand-scale');}
  }
  control.addEventListener('click', () => {paused = !paused; sync();});
  hero.addEventListener('pointermove', event => {
    if (!finePointer.matches || reduced.matches || paused) return;
    const bounds = hero.getBoundingClientRect(); pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top; pointer.active = true;
  }, {passive: true});
  hero.addEventListener('pointerleave', () => {pointer.active = false;});
  hero.addEventListener('pointerdown', event => {
    if (reduced.matches || paused || event.target.closest('a,button')) return;
    const bounds = hero.getBoundingClientRect();
    rings.push({x: event.clientX - bounds.left, y: event.clientY - bounds.top, age: 0});
    if (rings.length > 4) rings.shift();
  }, {passive: true});

  // A small scroll response from the original hero, with the catalogue always reachable.
  let scrollFrame = 0;
  function scrollResponse() {
    scrollFrame = 0;
    if (!visible || paused || reduced.matches) return;
    const bounds = hero.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, -bounds.top / bounds.height));
    hero.style.setProperty('--brand-y', `${(progress * 20).toFixed(2)}px`);
    hero.style.setProperty('--brand-scale', (1 + progress * .045).toFixed(3));
  }
  window.addEventListener('scroll', () => {if (!scrollFrame && visible) scrollFrame = requestAnimationFrame(scrollResponse);}, {passive:true});
  new ResizeObserver(resize).observe(hero);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {visible = entries[0].isIntersecting; sync();}, {threshold: 0}).observe(hero);
  } else visible = true;
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  resize(); sync();
})();
