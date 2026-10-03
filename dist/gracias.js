(function () {
  var params = new URLSearchParams(location.search);
  var claim = params.get("claim") || "";
  var paymentId = params.get("payment_id") || params.get("collection_id") || "";
  var flowToken = params.get("flow_token") || params.get("token") || "";
  var title = document.getElementById("title");
  var copy = document.getElementById("copy");
  var go = document.getElementById("go");
  var code = document.getElementById("code");
  var steps = document.getElementById("steps");
  var copied = document.getElementById("copied");
  var tries = 0;

  function copyCode(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {});
    }
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (e) { /* el código sigue visible para copiarlo a mano */ }
    area.remove();
  }
  function show(data) {
    if (data.status === "approved" && data.redeemUrl) {
      title.textContent = "Pago confirmado";
      copy.textContent = data.kind === "service"
        ? "Último paso: confirma tu pedido en Payhip con este código. Luego escríbeme por Instagram @iceroomcl."
        : "Último paso: canjea este código en Payhip y descargas al tiro." +
          (data.emailSent ? " También te lo mandamos por correo." : " Guárdalo por si cierras esta página.");
      if (data.coupon) {
        code.textContent = data.coupon;
        code.hidden = false;
        steps.hidden = false;
        go.onclick = function () { copyCode(data.coupon); copied.hidden = false; };
      }
      go.href = data.redeemUrl;
      go.textContent = data.coupon ? "Copiar código e ir a descargar" : "Ir a descargar";
      go.hidden = false;
      return true;
    }
    if (data.status === "rejected") {
      title.textContent = "Pago rechazado";
      copy.textContent = "Puedes volver a la tienda e intentarlo con otra tarjeta o con Webpay.";
      return true;
    }
    if (data.status === "refunded") {
      title.textContent = "Pago reembolsado";
      copy.textContent = "Este pedido fue anulado.";
      return true;
    }
    if (data.error) {
      title.textContent = "Aún no podemos confirmar el pago";
      copy.textContent = data.error + " Conserva esta página para revisar el estado.";
      return false;
    }
    title.textContent = "Confirmando el pago…";
    copy.textContent = "Estamos esperando la confirmación. No vuelvas a pagar mientras se procesa.";
    return false;
  }
  function endpoint() {
    if (!/^[a-f0-9]{32}$/.test(claim)) return "";
    if (paymentId) return "/api/order?payment_id=" + encodeURIComponent(paymentId) + "&claim=" + encodeURIComponent(claim);
    if (flowToken) return "/api/flow-order?token=" + encodeURIComponent(flowToken) + "&claim=" + encodeURIComponent(claim);
    return "/api/checkout-status?claim=" + encodeURIComponent(claim);
  }
  function poll() {
    var url = endpoint();
    if (!url) {
      title.textContent = "Falta el comprobante";
      copy.textContent = "Vuelve a la tienda e inicia el pago otra vez.";
      return;
    }
    fetch(url, { cache: "no-store" })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (!show(data) && tries++ < 40) setTimeout(poll, 3000);
      })
      .catch(function () {
        title.textContent = "Comprobando el pago…";
        copy.textContent = "No pudimos conectar. Volveremos a comprobarlo en unos segundos.";
        if (tries++ < 40) setTimeout(poll, 3000);
      });
  }
  poll();
})();
