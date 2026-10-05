(function () {
  var prices = {};
  var sheet = document.createElement("div");
  sheet.className = "pay-sheet";
  sheet.hidden = true;
  function icon(path) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  var diamond = '<svg viewBox="0 0 84 81" aria-hidden="true"><path d="M16 0H68L84 26L42 81L0 26Z" fill="currentColor"/></svg>';
  var arrow = '<span class="pay-method-arrow" aria-hidden="true">↗</span>';
  sheet.innerHTML = '<div class="pay-sheet-card" role="dialog" aria-modal="true" aria-labelledby="pay-sheet-title" tabindex="-1">' +
    '<div class="pay-titlebar"><div class="pay-window-controls"><button type="button" class="pay-x" aria-label="Cerrar checkout" data-action="close"><span aria-hidden="true">×</span></button><span class="pay-window-dot" aria-hidden="true"></span><span class="pay-window-dot" aria-hidden="true"></span></div><span class="pay-window-brand">' + diamond + 'iceroom</span><span class="pay-window-lock">' + icon('<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>') + '</span></div>' +
    '<div class="pay-sheet-body"><section class="pay-overview" aria-label="Información del producto"><p class="pay-eyebrow">HECHO PARA TU PRÓXIMA SESIÓN</p><div class="pay-product"><div class="pay-product-art" aria-hidden="true">' + diamond + '</div><div class="pay-product-info"><p class="pay-product-type"></p><h2 id="pay-sheet-title">Tu producto</h2></div></div><p class="pay-product-description"></p><h3 class="pay-includes-title">Lo que recibes</h3><ul class="pay-includes"></ul><p class="pay-requirements"></p><p class="pay-delivery"></p></section><section class="pay-purchase" aria-label="Resumen y medios de pago"><p class="pay-eyebrow">TU PEDIDO</p><div class="pay-total"><div><span class="pay-total-label">Total en USD · PayPal</span><p class="pay-product-usd" id="pay-product-usd"></p><p class="pay-sheet-price" id="pay-sheet-price" aria-live="polite"></p></div><span class="pay-once">Pago único</span></div><p class="pay-selected-extra" hidden></p>' +
    '<p class="pay-cyber-note" hidden>✦ Cyber Day · 25% aplicado al precio. Sin código.</p>' +
    '<button type="button" class="pay-addon" data-action="toggle-addon" hidden aria-pressed="false"><span class="pay-addon-check">+</span><span><span class="pay-addon-label">EXTRA OPCIONAL</span><b>Agrega 3 plugins Pritti <em>+ US$2.99</em></b><small>Grip + Backroom + Eco Delay. Se suman a tu plantilla y al total.</small></span></button>' +
    '<details class="pay-coupon"><summary>¿Tienes un cupón? <span aria-hidden="true">+</span></summary><label class="pay-sr-only" for="pay-coupon-code">Código de descuento</label><div class="pay-coupon-entry"><input id="pay-coupon-code" type="text" autocomplete="off" maxlength="40" placeholder="Código de descuento"><button type="button" data-action="apply-coupon">Aplicar</button></div><p id="pay-coupon-result" aria-live="polite"></p><small class="pay-coupon-hint">Para tarjeta y Webpay. En PayPal, aplícalo al continuar.</small></details>' +
    '<div id="pay-methods"><div class="pay-methods-heading"><h3>Elige cómo pagar</h3><span>CLP / USD</span></div><button type="button" class="pay-choice pay-method pay-soon" data-action="card" aria-disabled="true"><span class="pay-method-icon">' + icon('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>') + '</span><span class="pay-method-copy"><b>Débito o crédito</b><small>Mercado Pago · pesos chilenos</small></span>' + arrow + '</button>' +
    '<button type="button" class="pay-choice pay-method ghost" data-action="flow" hidden><span class="pay-method-icon">' + icon('<path d="m3 9 9-5 9 5M5 10h14M6 10v8m6-8v8m6-8v8M3 20h18"/>') + '</span><span class="pay-method-copy"><b>Webpay · Redcompra</b><small>Flow · pesos chilenos</small></span>' + arrow + '</button>' +
    '<button type="button" class="pay-choice pay-method ghost" data-action="paypal"><span class="pay-method-icon">' + icon('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 9V6a2 2 0 0 1 2-2h13M21 12h-5v5h5M17 14.5h.01"/>') + '</span><span class="pay-method-copy"><b>PayPal</b><small id="pay-paypal-price">Pago internacional · USD</small></span>' + arrow + '</button></div>' +
    '<div id="pay-card" hidden><p class="pay-sheet-note">Pago seguro procesado por Mercado Pago.</p>' +
    '<div id="card-payment-brick"></div><p class="pay-sheet-note" id="card-after" hidden>🔒 Apenas se aprueba el pago, ves tu acceso en pantalla y te llega al correo.</p>' +
    '<button type="button" class="pay-choice ghost" data-action="retry-card" hidden>Reintentar con otra tarjeta</button>' +
    '<button type="button" class="pay-choice ghost" data-action="flow" hidden>¿Prefieres Webpay? Paga con Redcompra →</button></div>' +
    '<div id="pay-challenge" hidden><p class="pay-sheet-note">Tu banco necesita confirmar la compra.</p><div id="status-screen-brick"></div></div>' +
    '<div id="pay-flow" hidden><label class="flow-mail">Correo para el comprobante<input id="flow-email" type="email" autocomplete="email" inputmode="email" placeholder="tu@correo.cl" required></label>' +
    '<button type="button" class="pay-choice" data-action="flow-submit">Continuar a Webpay</button></div>' +
    '<p class="pay-status" role="status" aria-live="polite" hidden></p>' +
    '<button type="button" class="pay-close" data-action="back" hidden>← Volver a medios de pago</button>' +
    '<p class="pay-footer-note">' + icon('<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>') + 'Elegir un medio de pago todavía no realiza un cobro.</p></section></div></div>';
  document.body.appendChild(sheet);
  // ?prueba=<TEST_KEY> habilita en el servidor el producto de prueba; ya no hay botón visible.
  var testKey = new URLSearchParams(location.search).get("prueba") || "";

  var card = sheet.querySelector(".pay-sheet-card");
  var title = sheet.querySelector("#pay-sheet-title");
  var price = sheet.querySelector("#pay-sheet-price");
  var usdPrice = sheet.querySelector("#pay-product-usd");
  var productArt = sheet.querySelector(".pay-product-art");
  var couponDetails = sheet.querySelector(".pay-coupon");
  var methods = sheet.querySelector("#pay-methods");
  var cardPanel = sheet.querySelector("#pay-card");
  var flowPanel = sheet.querySelector("#pay-flow");
  var challengePanel = sheet.querySelector("#pay-challenge");
  var flowEmail = sheet.querySelector("#flow-email");
  var couponInput = sheet.querySelector("#pay-coupon-code");
  var couponResult = sheet.querySelector("#pay-coupon-result");
  var addon = sheet.querySelector(".pay-addon");
  var retryCard = sheet.querySelector('[data-action="retry-card"]');
  var status = sheet.querySelector(".pay-status");
  var back = sheet.querySelector('[data-action="back"]');
  var current = null;
  var busy = false;
  var brick = null;
  var statusBrick = null;
  var challengeActive = false;
  var sdkPromise = null;
  var activeClaim = "";
  var localReady = false;
  var cardReady = false;
  var flowReady = false;
  var pricesLoaded = false;
  var currentClp = true;
  var appliedCoupon = "";
  var addonSelected = false;

  // Product facts from the published catalog. Do not infer OS, formats or licences.
  var productInfo = {
    '0QEeV': { name:'Plantilla de Grabación — FL Studio', type:'PLANTILLA · PREMIUM', description:'Abre una sesión lista para grabar, en lugar de empezar desde cero.', includes:['Sesión .flp con cadenas de voz y ruteos configurados','Guía de uso y presets de efectos','Pritti Vocals incluido'], requirements:'FL Studio 20 o superior. Requiere plugins externos de pago, no incluidos. Grip, Backroom y Eco Delay se venden aparte.' },
    'xNaVU': { name:'Plantilla FL + 3 plugins Pritti', type:'PLANTILLA + PLUGINS', description:'La sesión de grabación FL con tres herramientas más para trabajar tu voz.', includes:['Plantilla FL Premium + guía de uso','Pritti Vocals incluido con la plantilla','Pritti Grip, Backroom y Eco Delay'], requirements:'FL Studio 20 o superior. La plantilla requiere además plugins externos de pago; este pack no incluye esas licencias.' },
    '34vZU': { name:'Plantilla FL — Plugins Nativos', type:'PLANTILLA · NATIVA', description:'Abre, canta y graba con los efectos que ya vienen en FL Studio.', includes:['Sesión .flp de grabación','Cadena con plugins nativos de FL Studio','Guía de uso'], requirements:'Necesitas FL Studio. No requiere instalar plugins externos de pago.' },
    '3j8In': { name:'Plantilla de Grabación — Ableton Live', type:'PLANTILLA · ABLETON', description:'Empieza a grabar tus voces con los racks y ruteos preparados.', includes:['Plantilla de grabación para Ableton Live','Racks nativos y ruteos de voz','Pritti Vocals de regalo'], requirements:'Necesitas Ableton Live. La compra no incluye una licencia del programa.' },
    '8Ljoq': { name:'Pack de Plantillas — FL + Ableton', type:'PACK · 2 PLANTILLAS', description:'Tu flujo de grabación, preparado para trabajar en ambos DAW.', includes:['Plantilla de grabación FL Studio','Plantilla de grabación Ableton Live','Pritti Vocals de regalo'], requirements:'Necesitas el DAW correspondiente. La plantilla FL Premium requiere plugins externos de pago, no incluidos.' },
    'QLfl6': { name:'Pritti Studio', type:'PLANTILLAS + PLUGINS', description:'La sesión y las herramientas Pritti, reunidas en un mismo pack.', includes:['Plantillas de grabación FL Studio y Ableton','Pritti Vocals, Backroom y Eco','Pritti Grip beta + próximos plugins Pritti'], requirements:'Necesitas el DAW correspondiente. Los plugins externos de pago que requiere la plantilla FL Premium no están incluidos.' },
    'Vo0Sq': { name:'Pritti Grip', type:'PLUGIN · BETA v0.9', description:'Compresión vocal con carácter para llevar la voz al frente.', includes:['Compresor vocal Pritti Grip beta','4 estilos: vocals, bus, hard y aggressive','Color de cinta, válvula y FET'], requirements:'Es un plugin para usar dentro de tu DAW. Esta versión está en beta.' },
    'SQti3': { name:'Pritti Backroom', type:'PLUGIN · REVERB', description:'Dale espacio a la voz: de un ambiente íntimo a una reverb profunda.', includes:['Plugin Pritti Backroom','Reverb para dar ambiente y profundidad a la voz'], requirements:'Es un plugin para usar dentro de tu DAW.' },
    'Nqvbs': { name:'Pritti Vocals', type:'PLUGIN · VOCES', description:'Un punto de partida rápido para encontrar el brillo y la presencia de tu voz.', includes:['Plugin Pritti Vocals','Procesamiento enfocado en voces'], requirements:'Es un plugin para usar dentro de tu DAW.' },
    '5JbVN': { name:'Pritti Eco', type:'PLUGIN · DELAY', description:'Ecos con carácter, de un slap sutil a estelas largas con modulación.', includes:['Plugin Pritti Eco Delay','Delay con modulación para voces'], requirements:'Es un plugin para usar dentro de tu DAW.' },
    'G5U1r': { name:'Pritti Bundle', type:'PACK · PLUGINS', description:'El ecosistema Pritti en una sola compra.', includes:['Pritti Vocals, Backroom y Eco','Pritti Grip en beta','Acceso a próximos plugins Pritti'], requirements:'Plugins para usar dentro de tu DAW. No incluye las plantillas de grabación.' },
    'a8IWu': { name:'Masterclass: Mezcla Pro', type:'FORMACIÓN · 2 TEMPORADAS', description:'El proceso de mezcla de icycold, explicado paso a paso con sesiones reales.', includes:['Dos temporadas completas','Grabación, EQ, compresión y balance','Pritti Vocals de regalo'], requirements:'Contenido formativo digital. No incluye una licencia del DAW.' },
    'IiHTG': { name:'The Ultimate Bundle', type:'CURSO + PLANTILLAS + PLUGINS', description:'Aprende el proceso y llévalo a tus sesiones con las plantillas incluidas.', includes:['Masterclass Mezcla Pro completa','Plantillas de grabación FL Studio y Ableton','Pritti Vocals y Pritti Backroom'], requirements:'Necesitas el DAW correspondiente. La plantilla FL Premium requiere plugins externos de pago, no incluidos.' },
    'z6Bgp': { name:'Mezcla + Master — 1 canción', type:'SERVICIO · UNA CANCIÓN', description:'Envía tus pistas y trabajamos la mezcla de voz y beat, más el master.', includes:['Mezcla de voz y beat + master','2 rondas de ajustes','Entrega en 5 días hábiles'], requirements:'Después de pagar debes enviar tus pistas. Es un servicio, no una descarga inmediata.' }
  };
  function renderProductInfo(key) {
    var info = productInfo[key];
    if (!info) return;
    title.textContent = info.name;
    var orderName = sheet.querySelector('.pay-order-name');
    if (!orderName) {
      orderName = document.createElement('p'); orderName.className = 'pay-order-name';
      sheet.querySelector('.pay-total').before(orderName);
    }
    orderName.textContent = info.name;
    sheet.querySelector('.pay-product-type').textContent = info.type;
    sheet.querySelector('.pay-product-description').textContent = info.description;
    sheet.querySelector('.pay-includes').replaceChildren();
    info.includes.forEach(function (text) {
      var li = document.createElement('li'); li.textContent = text;
      sheet.querySelector('.pay-includes').appendChild(li);
    });
    var requirements = sheet.querySelector('.pay-requirements');
    requirements.replaceChildren();
    var label = document.createElement('b'); label.textContent = 'Antes de comprar';
    requirements.append(label, document.createTextNode(info.requirements));
    sheet.querySelector('.pay-delivery').textContent = key === 'z6Bgp' ? 'Recibirás las instrucciones para enviar tu canción después del pago.' : 'Producto digital · acceso después de confirmar el pago.';
  }

  fetch("/api/prices").then(function (r) { return r.json(); }).then(function (data) {
    prices = data || {};
    pricesLoaded = true;
    if (current) { showLocalMethods(Boolean(prices[productKey()])); if (!appliedCoupon) refreshSummary(); }
  }).catch(function () {});
  fetch("/api/methods" + (testKey ? "?prueba=" + encodeURIComponent(testKey) : "")).then(function (r) { if (!r.ok) throw new Error("unavailable"); return r.json(); })
    .then(function (methods) {
      cardReady = Boolean(methods.card);
      flowReady = Boolean(methods.flow);
      localReady = Boolean(methods.card || methods.flow);
      showLocalMethods(!current || !pricesLoaded || Boolean(prices[productKey()]));
      if (current && !appliedCoupon) refreshSummary();
    }).catch(function () {});

  /** Tarjeta y Webpay solo si el producto tiene precio en pesos (los bundles sin colección van por PayPal). */
  function showLocalMethods(clp) {
    var cardButton = sheet.querySelector('[data-action="card"]');
    cardButton.classList.toggle("pay-soon", !(cardReady && clp));
    cardButton.setAttribute("aria-disabled", String(!(cardReady && clp)));
    currentClp = clp;
    sheet.querySelectorAll('[data-action="flow"]').forEach(function (button) { button.hidden = !(flowReady && clp); });
  }

  function money(n) { return "$" + Number(n).toLocaleString("es-CL"); }
  function productKey() {
    return addonSelected && current?.dataset.addon ? current.dataset.addon : current?.getAttribute("data-mp");
  }
  function usdLabel() {
    var offer = window.iceroomPromotion?.get().products[productKey()];
    if (offer) return '$' + (offer.usd / 100).toFixed(2);
    if (addonSelected && current?.dataset.addonUsd) return current.dataset.addonUsd;
    var item = current?.closest("article, .bundle-inner, .news-item") || document.body;
    return item.querySelector(".price")?.textContent.trim() || "precio en USD al continuar";
  }
  function refreshSummary() {
    var key = productKey();
    var campaign = window.iceroomPromotion?.get();
    var offer = campaign?.products[key];
    var clp = offer?.clp || prices[key];
    price.textContent = !localReady ? "" : clp ? "O " + money(clp) + " CLP con tarjeta / Webpay"
      : "El monto en CLP se confirma antes de pagar";
    var amount = usdLabel();
    usdPrice.textContent = amount.startsWith("$") ? "US" + amount : amount;
    if (campaign?.active && offer) {
      var previous = document.createElement('del'); previous.className='cyber-previous';
      previous.textContent='US$'+(offer.regularUsd/100).toFixed(2); usdPrice.appendChild(previous);
    }
    sheet.querySelector('#pay-paypal-price').textContent = amount.startsWith("$") ? "US" + amount + " · pago internacional" : amount;
    sheet.querySelector('.pay-cyber-note').hidden = !campaign?.active;
    couponDetails.hidden = Boolean(campaign?.active);
    var solo = campaign?.products[current?.getAttribute('data-mp')];
    var combo = campaign?.products[current?.dataset.addon];
    addon.querySelector('em').textContent = '+ US$' + (solo && combo ? ((combo.usd-solo.usd)/100).toFixed(2) : '2.99');
    var extra = sheet.querySelector('.pay-selected-extra');
    extra.hidden = !addonSelected;
    extra.textContent = '✓ Incluye tu plantilla + Grip, Backroom y Eco Delay';
    if (current) renderProductInfo(key);
  }
  window.addEventListener('iceroom:promotion', function () {
    if (current && !busy && card.dataset.step === 'methods') {
      if (window.iceroomPromotion?.get().active) { appliedCoupon=''; couponInput.value=''; couponResult.textContent=''; }
      refreshSummary();
    }
  });
  function notice(message, error) {
    status.hidden = !message;
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(error));
  }
  function setBusy(value, message) {
    busy = value;
    sheet.querySelectorAll("button").forEach(function (button) { button.disabled = value; });
    if (message) notice(message, false);
  }
  async function api(path, body) {
    var response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(data.error || "No pudimos iniciar el pago. Intenta nuevamente.");
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function unmountBrick() {
    if (brick) { brick.unmount(); brick = null; }
    sheet.querySelector("#card-after").hidden = true;
    if (statusBrick) { statusBrick.unmount(); statusBrick = null; }
    sheet.querySelector("#card-payment-brick").replaceChildren();
  }
  function showStep(name) {
    card.dataset.step = name;
    if (name !== "card") unmountBrick();
    methods.hidden = name !== "methods";
    cardPanel.hidden = name !== "card";
    flowPanel.hidden = name !== "flow";
    challengePanel.hidden = name !== "challenge";
    back.hidden = name === "methods" || name === "challenge";
    notice("", false);
  }
  function closeSheet() {
    if (busy) return;
    unmountBrick();
    sheet.hidden = true;
    document.body.classList.remove("pay-open");
    if (current) current.focus();
    current = null;
    activeClaim = "";
    challengeActive = false;
  }
  function openSheet(button) {
    current = button;
    var product = button.getAttribute("data-mp");
    var item = button.closest("article, .bundle-inner, .news-item") || document.body;
    var heading = item.querySelector("h3, h2");
    title.textContent = heading ? heading.textContent : "Tu producto";
    var artwork = {
      '0QEeV': ['fl-logo.webp'], 'xNaVU': ['fl-logo.webp'], '34vZU': ['fl-logo.webp'],
      '3j8In': ['ableton-logo.svg'], '8Ljoq': ['fl-logo.webp', 'ableton-logo.svg'],
      'QLfl6': ['fl-logo.webp', 'grip-ui.webp'], 'G5U1r': ['grip-ui.webp', 'eco-ui.webp'],
      'Vo0Sq': ['grip-ui.webp'], 'SQti3': ['backroom-ui.webp'], 'Nqvbs': ['vocals-ui.webp'],
      '5JbVN': ['eco-ui.webp'], 'a8IWu': ['icycold.webp'], 'IiHTG': ['icycold.webp', 'fl-logo.webp']
    };
    var images = artwork[product] || [];
    productArt.classList.toggle('pay-art-stack', images.length > 1);
    productArt.replaceChildren();
    if (!images.length) productArt.innerHTML = diamond;
    images.forEach(function (file) {
      var image = document.createElement('img'); image.src = '/img/art/' + file; image.alt = '';
      image.className = file.includes('logo') ? 'pay-art-logo' : 'pay-art-ui';
      productArt.appendChild(image);
    });
    appliedCoupon = "";
    addonSelected = false;
    addon.hidden = !button.dataset.addon;
    addon.setAttribute("aria-pressed", "false");
    addon.querySelector(".pay-addon-check").textContent = "+";
    couponInput.value = "";
    couponDetails.open = false;
    couponResult.textContent = "";
    couponResult.classList.remove("ok", "error");
    var clp = !pricesLoaded || Boolean(prices[product]);
    showLocalMethods(clp);
    refreshSummary();
    sheet.hidden = false;
    document.body.classList.add("pay-open");
    showStep("methods");
    card.focus();
  }
  async function applyCoupon() {
    if (!current || busy) return;
    var code = couponInput.value.trim().toUpperCase();
    if (!code) {
      appliedCoupon = "";
      refreshSummary();
      couponResult.textContent = "Escribe un código.";
      couponResult.className = "error";
      return;
    }
    setBusy(true);
    couponResult.textContent = "Validando…";
    couponResult.className = "";
    try {
      var quote = await api("/api/coupon-quote", { product: productKey(), coupon: code });
      appliedCoupon = quote.coupon;
      price.textContent = money(quote.amount) + " CLP · ahorras " + money(quote.discount);
      couponResult.textContent = "Cupón " + quote.coupon + " aplicado.";
      couponResult.className = "ok";
    } catch (error) {
      appliedCoupon = "";
      refreshSummary();
      couponResult.textContent = error.message;
      couponResult.className = "error";
    } finally { setBusy(false); }
  }
  function loadSecurity() {
    // Script antifraude de MP: define window.MP_DEVICE_SESSION_ID para /api/card-payment.
    if (document.querySelector('script[data-mp-security]')) return;
    var s = document.createElement("script");
    s.src = "https://www.mercadopago.com/v2/security.js";
    s.setAttribute("view", "checkout");
    s.setAttribute("data-mp-security", "1");
    document.head.appendChild(s);
  }
  async function deviceId() {
    // security.js tarda ~5 s en armar la huella; sin ella el antifraude de MP rechaza por riesgo.
    for (var i = 0; i < 16 && !window.MP_DEVICE_SESSION_ID; i++) {
      await new Promise(function (r) { setTimeout(r, 250); });
    }
    return window.MP_DEVICE_SESSION_ID || "";
  }
  function loadSdk() {
    loadSecurity();
    if (window.MercadoPago) return Promise.resolve();
    if (!sdkPromise) sdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.onload = resolve;
      script.onerror = function () { sdkPromise = null; reject(new Error("No se pudo cargar el formulario de tarjeta.")); };
      document.head.appendChild(script);
    });
    return sdkPromise;
  }
  async function startCard() {
    var product = productKey();
    if (!product || busy) return;
    showStep("card");
    retryCard.hidden = true;
    setBusy(true, "Preparando pago seguro…");
    try {
      var config = await api("/api/card-config", { product: product, prueba: testKey, coupon: appliedCoupon });
      activeClaim = config.claim;
      price.textContent = money(config.amount) + " CLP";
      await loadSdk();
      var mp = new window.MercadoPago(config.publicKey, { locale: "es-CL" });
      brick = await mp.bricks({ theme: "dark" }).create("cardPayment", "card-payment-brick", {
        initialization: { amount: config.amount },
        customization: { visual: { style: { theme: "dark" }, texts: { formSubmit: "Pagar " + money(config.amount) } } },
        callbacks: {
          onReady: function () { setBusy(false); notice("", false); sheet.querySelector("#card-after").hidden = false; },
          onError: function () { setBusy(false); notice("No se pudo mostrar el formulario. Prueba Webpay vía Flow.", true); },
          onSubmit: async function (formData) {
            setBusy(true, "Procesando el pago…");
            try {
              var result = await api("/api/card-payment", { claim: activeClaim, formData: formData, deviceId: await deviceId() });
              if (result.status === "pending_challenge") {
                challengeActive = true;
                await showChallenge(mp, result);
                return;
              }
              if (result.url) { location.assign(result.url); return; }
              notice("Estamos verificando el cobro. No vuelvas a pagar todavía.", false);
            } catch (error) {
              if (challengeActive) {
                challengeActive = false;
                location.assign("/gracias.html?claim=" + activeClaim);
                return;
              }
              notice(error.message, true);
              if (error.status === 402) retryCard.hidden = false;
              if ([409, 502].includes(error.status) && activeClaim) {
                location.assign("/gracias.html?claim=" + activeClaim);
              }
            } finally {
              if (!challengeActive) setBusy(false);
            }
          }
        }
      });
    } catch (error) {
      setBusy(false);
      notice(error.message, true);
    }
  }
  async function showChallenge(mp, result) {
    unmountBrick();
    showStep("challenge");
    notice("Confirma la compra con tu banco.", false);
    statusBrick = await mp.bricks({ theme: "dark" }).create("statusScreen", "status-screen-brick", {
      initialization: { paymentId: result.paymentId, additionalInfo: result.challenge },
      callbacks: {
        onReady: function () { notice("Completa la validación bancaria para finalizar.", false); },
        onError: function () { notice("No pudimos mostrar la validación. Conserva este pedido y revisa su estado.", true); }
      }
    });
    var checks = 0;
    async function poll() {
      if (!challengeActive || !activeClaim) return;
      try {
        var response = await fetch("/api/checkout-status?claim=" + activeClaim, { cache: "no-store" });
        var data = await response.json();
        if (["approved", "rejected", "refunded"].includes(data.status)) {
          location.assign("/gracias.html?claim=" + activeClaim);
          return;
        }
      } catch (error) { /* El webhook y la pantalla final seguirán comprobando. */ }
      if (checks++ < 60) setTimeout(poll, 3000);
      else { challengeActive = false; setBusy(false); notice("La validación sigue pendiente. Revisa el estado del pedido.", false); }
    }
    setTimeout(poll, 3000);
  }
  async function startFlow() {
    if (!current || busy) return;
    var email = flowEmail.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notice("Escribe un correo válido para el comprobante.", true);
      flowEmail.focus();
      return;
    }
    setBusy(true, "Conectando con Webpay…");
    try {
      var result = await api("/api/flow-checkout", { product: productKey(), email: email, prueba: testKey, coupon: appliedCoupon });
      location.assign(result.url);
    } catch (error) {
      setBusy(false);
      notice(error.message, true);
    }
  }
  document.addEventListener("click", function (event) {
    // Cualquier enlace de compra con data-mp (botones de las cards y enlaces de Novedades) abre el selector.
    var button = event.target.closest("a[data-mp]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openSheet(button);
  }, true);
  sheet.addEventListener("click", function (event) {
    if (event.target === sheet && !busy) { closeSheet(); return; }
    var action = event.target.closest("[data-action]")?.getAttribute("data-action");
    if (!action || busy) return;
    if (action === "close") closeSheet();
    if (action === "back") showStep("methods");
    if (action === "card") {
      if (cardReady && currentClp) startCard();
      else if (cardReady) notice("Este pack todavía no se puede pagar en pesos. Por ahora paga con PayPal: acepta débito y crédito.", false);
      else notice("El pago con débito o tarjeta chilena se activa muy pronto. Por ahora puedes pagar con PayPal.", false);
    }
    if (action === "retry-card") { unmountBrick(); startCard(); }
    if (action === "flow") { showStep("flow"); flowEmail.focus(); }
    if (action === "flow-submit") startFlow();
    if (action === "apply-coupon") applyCoupon();
    if (action === "toggle-addon") {
      addonSelected = !addonSelected;
      appliedCoupon = "";
      couponInput.value = "";
      couponResult.textContent = "";
      addon.setAttribute("aria-pressed", String(addonSelected));
      addon.querySelector(".pay-addon-check").textContent = addonSelected ? "✓" : "+";
      refreshSummary();
    }
    if (action === "paypal" && current) {
      var button = current;
      var product = productKey();
      var addonHref = addonSelected && button.dataset.addonHref;
      closeSheet();
      if (addonHref) {
        location.assign(addonHref);
      } else if (button.classList.contains("payhip-buy-button")) {
        // El overlay de Payhip abre PayPal en una ventana emergente que Instagram y
        // otros navegadores internos suelen bloquear. El checkout de página completa
        // conserva la entrega automática y permite relanzar PayPal con menos fricción.
        location.assign("/api/paypal-checkout?product=" + encodeURIComponent(product));
      } else {
        location.assign(button.href);
      }
    }
  });
  couponInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); applyCoupon(); }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !sheet.hidden) closeSheet();
    if (event.key === "Tab" && !sheet.hidden) {
      var focusable = Array.from(sheet.querySelectorAll("button:not([disabled]), input:not([disabled]), summary, a[href]"))
        .filter(function (el) { return el.getClientRects().length && (!el.closest('details:not([open])') || el.tagName === 'SUMMARY'); });
      if (!focusable.length) return;
      if (document.activeElement === card || !card.contains(document.activeElement)) {
        event.preventDefault(); focusable[event.shiftKey ? focusable.length - 1 : 0].focus(); return;
      }
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
    }
  });
  // La huella del dispositivo se arma desde que entran a la tienda, no al elegir tarjeta.
  if (document.readyState === "complete") loadSecurity();
  else window.addEventListener("load", loadSecurity);
  var deepLink = new URLSearchParams(location.search).get("checkout");
  if (deepLink) {
    var linkedButton = Array.from(document.querySelectorAll("a.buy[data-mp]"))
      .find(function (button) { return button.getAttribute("data-mp") === deepLink; });
    if (linkedButton) openSheet(linkedButton);
  }
})();
