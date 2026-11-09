(() => {
  'use strict';
  const ticker = document.querySelector('.ticker');
  const toggle = ticker?.querySelector('.ticker-toggle');
  toggle?.addEventListener('click', () => {
    const paused = ticker.dataset.paused !== 'true';
    ticker.dataset.paused = String(paused);
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Reanudar novedades' : 'Pausar novedades');
    toggle.textContent = paused ? '▶' : 'Ⅱ';
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Reuse the existing catalogue sections; without JS all remain readable.
  const tabs = [...document.querySelectorAll('[data-category]')];
  const panels = tabs.map(tab => document.getElementById(tab.dataset.category)).filter(Boolean);
  function selectCategory(id) {
    if (!panels.some(panel => panel.id === id)) return;
    panels.forEach(panel => { panel.hidden = panel.id !== id; });
    tabs.forEach(tab => {
      const selected = tab.dataset.category === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
  }
  tabs.forEach((tab, index) => {
    const panel = document.getElementById(tab.dataset.category);
    if (!panel) return;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    tab.addEventListener('click', () => selectCategory(tab.dataset.category));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectCategory(tabs[next].dataset.category);
      tabs[next].focus();
    });
  });
  const tabList = document.querySelector('.catalog-tabs');
  if (tabList && panels.length === tabs.length && tabs.length) {
    tabList.hidden = false;
    selectCategory('plantillas');
  }
  // Open the right category for links shared before the homepage redesign.
  function revealTarget(hash, scroll) {
    if (!hash || hash === '#') return;
    let target;
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
    if (!target) return;
    const panel = panels.find(panel => panel === target || panel.contains(target));
    if (panel) selectCategory(panel.id);
    let ancestor = target;
    while (ancestor) {
      if (ancestor.tagName === 'DETAILS') ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    if (scroll) requestAnimationFrame(() => target.scrollIntoView({behavior: reduced.matches ? 'instant' : 'smooth', block:'start'}));
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link) revealTarget(link.getAttribute('href'), false);
  });
  window.addEventListener('hashchange', () => revealTarget(location.hash, true));
  revealTarget(location.hash, true);
  const checkout = new URLSearchParams(location.search).get('checkout');
  if (checkout) {
    const buy = [...document.querySelectorAll('a[data-mp]')].find(link => link.dataset.mp === checkout);
    const panel = buy && panels.find(panel => panel.contains(buy));
    if (panel) selectCategory(panel.id);
    let parent = buy?.parentElement;
    while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
  }
  // The buying requirements must follow the selected DAW, including deep links.
  document.querySelectorAll('.setup-card[data-daw-keys]').forEach(card => {
    const requirements = card.querySelector('[data-pack-requirements]');
    if (!requirements) return;
    const flCopy = requirements.innerHTML;
    const sync = () => {
      const ableton = card.querySelector('[data-daw="ableton"]')?.getAttribute('aria-pressed') === 'true';
      requirements.innerHTML = ableton ? 'Necesitas Ableton Live. La plantilla usa racks nativos; la licencia del programa no está incluida.' : flCopy;
      const artwork = card.querySelector('[data-pack-daw-art]');
      const label = card.querySelector('[data-pack-daw-label]');
      if (artwork) artwork.src = ableton ? '/img/art/ableton-logo.svg' : '/img/art/fl-logo.webp';
      if (label) label.textContent = ableton ? 'PLANTILLA ABLETON LIVE' : 'PLANTILLA FL STUDIO';
    };
    card.querySelectorAll('[data-daw]').forEach(button => button.addEventListener('click', sync));
    sync();
  });
  if (!('IntersectionObserver' in window) || reduced.matches) return;
  // Content stays readable before and without JavaScript. Animate once, on entry.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('ice-enter');
      observer.unobserve(entry.target);
    });
  }, {threshold: .12});
  document.querySelectorAll('.setup-head, .setup-card, .pack-inventory, .riri-launch, .home-faq, .spotlight-main').forEach(el => observer.observe(el));
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    observer.disconnect();
    document.querySelectorAll('.ice-enter').forEach(el => el.classList.remove('ice-enter'));
  });
})();
