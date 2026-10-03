(function () {
  var prices = {};
  var sheet = document.createElement("div");
  sheet.className = "pay-sheet";
  sheet.hidden = true;
  sheet.innerHTML = '<div class="pay-sheet-card" role="dialog" aria-modal="true" aria-labelledby="pay-sheet-title" tabindex="-1">' +
    '<button type="button" class="pay-x" aria-label="Cerrar" data-action="close">×</button>' +
    '<p class="kicker">ICEROOM · CHECKOUT</p><h2 id="pay-sheet-title">Tu producto</h2>' +
    '<p class="pay-sheet-price" id="pay-sheet-price"></p>' +
    '<button type="button" class="pay-addon" data-action="toggle-addon" hidden aria-pressed="false"><span class="pay-addon-check">+</span><span><b>Completa tu plantilla por $2.99</b><small>No incluye Pritti Grip, Pritti Backroom ni Pritti Eco Delay. Agrégalos ahora.</small></span></button>' +
    '<div class="pay-coupon"><label for="pay-coupon-code">¿Tienes un cupón?</label><div><input id="pay-coupon-code" type="text" autocomplete="off" maxlength="40" placeholder="Código de descuento"><button type="button" data-action="apply-coupon">Aplicar</button></div><p id="pay-coupon-result" aria-live="polite"></p></div>' +
    '<div id="pay-methods"><button type="button" class="pay-choice pay-soon" data-action="card" aria-disabled="true">Débito o tarjeta de crédito · Chile</button>' +
    '<button type="button" class="pay-choice ghost" data-action="flow" hidden>Webpay · Redcompra (Chile)</button>' +
    '<button type="button" class="pay-choice ghost" data-action="paypal">PayPal · internacional</button></div>' +
    '<div id="pay-card" hidden><p class="pay-sheet-note">Pago seguro procesado por Mercado Pago.</p>' +
    '<div id="card-payment-brick"></div><p class="pay-sheet-note" id="card-after" hidden>🔒 Apenas se aprueba el pago, ves tu acceso en pantalla y te llega al correo.</p>' +
    '<button type="button" class="pay-choice ghost" data-action="retry-card" hidden>Reintentar con otra tarjeta</button>' +
    '<button type="button" class="pay-choice ghost" data-action="flow" hidden>¿Prefieres Webpay? Paga con Redcompra →</button></div>' +
    '<div id="pay-challenge" hidden><p class="pay-sheet-note">Tu banco necesita confirmar la compra.</p><div id="status-screen-brick"></div></div>' +
    '<div id="pay-flow" hidden><label class="flow-mail">Correo para el comprobante<input id="flow-email" type="email" autocomplete="email" inputmode="email" placeholder="tu@correo.cl" required></label>' +
    '<button type="button" class="pay-choice" data-action="flow-submit">Continuar a Webpay</button></div>' +
    '<p class="pay-status" role="status" aria-live="polite" hidden></p>' +
    '<button type="button" class="pay-close" data-action="back" hidden>Volver a medios de pago</button></div>';
  document.body.appendChild(sheet);
  // ?prueba=<TEST_KEY> habilita en el servidor el producto de prueba; ya no hay botón visible.
  var testKey = new URLSearchParams(location.search).get("prueba") || "";

  var card = sheet.querySelector(".pay-sheet-card");
  var title = sheet.querySelector("#pay-sheet-title");
  var price = sheet.querySelector("#pay-sheet-price");
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

  fetch("/api/prices").then(function (r) { return r.json(); }).then(function (data) {
    prices = data || {};
    pricesLoaded = true;
  }).catch(function () {});
  fetch("/api/methods" + (testKey ? "?prueba=" + encodeURIComponent(testKey) : "")).then(function (r) { if (!r.ok) throw new Error("unavailable"); return r.json(); })
    .then(function (methods) {
      cardReady = Boolean(methods.card);
      flowReady = Boolean(methods.flow);
      localReady = Boolean(methods.card || methods.flow);
      showLocalMethods(true);
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
    if (addonSelected && current?.dataset.addonUsd) return current.dataset.addonUsd;
    var item = current?.closest("article, .bundle-inner, .news-item") || document.body;
    return item.querySelector(".price")?.textContent.trim() || "precio en USD al continuar";
  }
  function refreshSummary() {
    var key = productKey();
    price.textContent = !localReady ? "" : prices[key] ? money(prices[key]) + " CLP para Chile"
      : "El monto en CLP se confirma antes de pagar";
    sheet.querySelector('[data-action="paypal"]').textContent = "PayPal · " + usdLabel();
  }
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
    var usdPrice = item.querySelector(".price");
    title.textContent = heading ? heading.textContent : "Tu producto";
    appliedCoupon = "";
    addonSelected = false;
    addon.hidden = !button.dataset.addon;
    addon.setAttribute("aria-pressed", "false");
    addon.querySelector(".pay-addon-check").textContent = "+";
    couponInput.value = "";
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
      var focusable = Array.from(sheet.querySelectorAll("button:not([disabled]), input:not([disabled])"))
        .filter(function (el) { return !el.closest("[hidden]"); });
      if (!focusable.length) return;
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
