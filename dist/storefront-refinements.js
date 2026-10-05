(function () {
  'use strict';
  var menu = document.getElementById('store-navigation');
  var menuButton = document.getElementById('store-menu');
  function closeMenu() { menu.classList.remove('menu-open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Abrir menú de navegación'); }
  menuButton.addEventListener('click', function () {
    var isOpen = menu.classList.toggle('menu-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.setAttribute('aria-label', isOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
  });
  menu.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', closeMenu); });

  var preview = document.getElementById('product-preview');
  var previewPanel = preview.querySelector('.preview-panel');
  var previewImage = preview.querySelector('img');
  var previewVideo = preview.querySelector('video');
  var previewEyebrow = preview.querySelector('.preview-eyebrow');
  var previewTitle = preview.querySelector('h3');
  var previewPrice = preview.querySelector('.price');
  var previewBuy = preview.querySelector('.buy');
  var opener = null;
  function closePreview(restoreFocus) {
    preview.hidden = true; document.body.classList.remove('preview-open');
    previewVideo.pause();
    if (opener && restoreFocus !== false) opener.focus();
  }
  document.querySelectorAll('[data-preview],[data-demo]').forEach(function (button) {
    button.addEventListener('click', function () {
      var card = button.closest('.card');
      var buy = card.querySelector('a[data-mp]');
      var image = card.querySelector('.card-media img');
      var isDemo = button.hasAttribute('data-demo');
      opener = button;
      previewTitle.textContent = card.querySelector('h3').textContent;
      previewImage.hidden = isDemo; previewVideo.hidden = !isDemo;
      previewPanel.classList.toggle('is-demo', isDemo);
      previewEyebrow.textContent = isDemo ? 'ICEROOM / Así grabo mis voces' : 'Pritti / Vista de interfaz';
      if (isDemo) {
        // Load the video only after the visitor asks to see it. Never autoplay audio.
        if (!previewVideo.getAttribute('src')) previewVideo.src = '/img/fl/demo.mp4';
        previewVideo.currentTime = 0;
      } else {
        previewImage.src = image.currentSrc || image.src; previewImage.alt = 'Interfaz de ' + previewTitle.textContent + ' — vista ampliada';
      }
      previewPrice.textContent = card.querySelector('.price').textContent;
      previewBuy.href = buy.href; previewBuy.dataset.mp = buy.dataset.mp;
      ['addon','addonUsd','addonHref'].forEach(function (key) {
        if (buy.dataset[key]) previewBuy.dataset[key] = buy.dataset[key];
        else delete previewBuy.dataset[key];
      });
      previewBuy.textContent = isDemo ? 'Quiero mi plantilla ↗' : 'Comprar plugin ↗';
      previewBuy.setAttribute('aria-label', 'Comprar ' + previewTitle.textContent);
      preview.hidden = false; document.body.classList.add('preview-open'); previewPanel.focus();
    });
  });
  // checkout.js reads this article in capture. Hide the preview without stealing checkout focus.
  document.addEventListener('click', function (event) { if (event.target.closest('.preview-buy')) closePreview(false); }, true);
  preview.addEventListener('click', function (event) { if (event.target === preview || event.target.closest('[data-preview-close]')) closePreview(); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (!preview.hidden) closePreview();
      else if (menu.classList.contains('menu-open')) { closeMenu(); menuButton.focus(); }
    }
    if (event.key === 'Tab' && !preview.hidden) {
      var controls = Array.from(preview.querySelectorAll('button,a[href],video:not([hidden])'));
      if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === previewPanel)) { event.preventDefault(); controls[controls.length-1].focus(); }
      else if (!event.shiftKey && document.activeElement === controls[controls.length-1]) { event.preventDefault(); controls[0].focus(); }
    }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) previewVideo.pause(); });

  // Filtering is progressive enhancement: all products remain visible without JS.
  var filterGroup = document.querySelector('.template-filters');
  var templateGrid = document.getElementById('template-products');
  var templateCards = Array.from(templateGrid.querySelectorAll('[data-template]'));
  var templateResults = document.getElementById('template-results');
  filterGroup.hidden = false;
  filterGroup.querySelectorAll('button').forEach(function (button) {
    button.setAttribute('aria-controls', 'template-products');
    button.addEventListener('click', function () {
      var count = 0;
      templateGrid.classList.remove('filter-changed');
      templateCards.forEach(function (card) {
        card.hidden = button.dataset.filter !== 'all' && card.dataset.template !== button.dataset.filter;
        if (!card.hidden) { count++; card.classList.add('is-visible'); }
      });
      filterGroup.querySelectorAll('button').forEach(function (control) { control.setAttribute('aria-pressed', String(control === button)); });
      templateResults.textContent = count + (count === 1 ? ' producto' : ' productos') + ' · ' + button.textContent;
      requestAnimationFrame(function () { templateGrid.classList.add('filter-changed'); });
    });
  });

  var navLinks = Array.from(menu.querySelectorAll('a'));
  var navSections = navLinks.map(function (link) { return document.querySelector(link.getAttribute('href')); });
  var navFrame = null;
  function updateNavigation() {
    var active = -1;
    navSections.forEach(function (section, index) { if (section.getBoundingClientRect().top <= 160) active = index; });
    navLinks.forEach(function (link, index) {
      if (index === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    navFrame = null;
  }
  function queueNavigation() { if (navFrame === null) navFrame = requestAnimationFrame(updateNavigation); }
  window.addEventListener('scroll', queueNavigation, {passive:true});
  window.addEventListener('resize', queueNavigation, {passive:true});
  queueNavigation();

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
    }, {threshold:.04});
    document.querySelectorAll('.cat-head,.card,.bundle-inner,.about-wrap').forEach(function (element) { element.classList.add('reveal'); observer.observe(element); });
    document.documentElement.classList.add('motion-ready');
    reducedMotion.addEventListener('change', function () { if (reducedMotion.matches) { document.documentElement.classList.remove('motion-ready'); observer.disconnect(); } });
  }
  if (window.matchMedia('(hover:hover)').matches && !reducedMotion.matches) {
    document.querySelectorAll('.card').forEach(function (card) {
      var frame = null;
      card.addEventListener('pointermove', function (event) {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(function () {
          var bounds = card.getBoundingClientRect();
          card.style.setProperty('--pointer-x', (event.clientX-bounds.left)+'px');
          card.style.setProperty('--pointer-y', (event.clientY-bounds.top)+'px');
          frame = null;
        });
      }, {passive:true});
    });
  }
})();
