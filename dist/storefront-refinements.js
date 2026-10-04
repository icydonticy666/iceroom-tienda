(function () {
  'use strict';
  var menu = document.getElementById('store-navigation');
  var menuButton = document.getElementById('store-menu');
  function closeMenu() { menu.classList.remove('menu-open'); menuButton.setAttribute('aria-expanded', 'false'); }
  menuButton.addEventListener('click', function () { menuButton.setAttribute('aria-expanded', String(menu.classList.toggle('menu-open'))); });
  menu.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', closeMenu); });

  var preview = document.getElementById('product-preview');
  var previewPanel = preview.querySelector('.preview-panel');
  var previewImage = preview.querySelector('img');
  var previewTitle = preview.querySelector('h3');
  var previewPrice = preview.querySelector('.price');
  var previewBuy = preview.querySelector('.buy');
  var opener = null;
  function closePreview(restoreFocus) {
    preview.hidden = true; document.body.classList.remove('preview-open');
    if (opener && restoreFocus !== false) opener.focus();
  }
  document.querySelectorAll('[data-preview]').forEach(function (button) {
    button.addEventListener('click', function () {
      var card = button.closest('.card');
      var buy = card.querySelector('a[data-mp]');
      var image = card.querySelector('.card-media img');
      opener = button;
      previewTitle.textContent = card.querySelector('h3').textContent;
      previewImage.src = image.currentSrc || image.src; previewImage.alt = image.alt + ' — interfaz ampliada';
      previewPrice.textContent = card.querySelector('.price').textContent;
      previewBuy.href = buy.href; previewBuy.dataset.mp = buy.dataset.mp;
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
      var controls = Array.from(preview.querySelectorAll('button,a[href]'));
      if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === previewPanel)) { event.preventDefault(); controls[controls.length-1].focus(); }
      else if (!event.shiftKey && document.activeElement === controls[controls.length-1]) { event.preventDefault(); controls[0].focus(); }
    }
  });

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var meteors = document.getElementById('meteors');
  if (!reducedMotion.matches) {
    for (var i=0; i<10; i++) {
      var meteor = document.createElement('span'); meteor.className = 'meteor';
      meteor.style.top = Math.random()*100+'%'; meteor.style.left = Math.random()*100+'%';
      meteor.style.animationDuration = (Math.random()*5+5).toFixed(1)+'s'; meteor.style.animationDelay = (Math.random()*9).toFixed(1)+'s'; meteors.appendChild(meteor);
    }
  }
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
