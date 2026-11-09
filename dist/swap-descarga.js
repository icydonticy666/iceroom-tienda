// Descargar swap pide solo el correo: cualquier enlace a /swap/windows|mac|intel abre este
// formulario; al enviarlo, /api/swap-descarga guarda el correo y devuelve el enlace firmado.
// Si se llega con ?descargar=<os> (enlace viejo o sin firma) el formulario se abre solo.
// Con ?invitacion=<código> el formulario es una invitación a swap Pro: correo + sistema, y
// /api/swap-invitacion activa Pro para ese correo antes de descargar.
(function () {
  var dialog = document.getElementById('descarga-swap');
  if (!dialog) return;
  var form = dialog.querySelector('form');
  var correo = document.getElementById('descarga-correo');
  var estado = document.getElementById('descarga-estado');
  var boton = dialog.querySelector('button[type=submit]');
  var grupoOs = document.getElementById('descarga-os');
  var enlace = document.getElementById('descarga-reintentar');
  var nombres = { windows: 'Windows', mac: 'Mac Apple Silicon', intel: 'Mac Intel' };
  var params = new URLSearchParams(window.location.search);
  var invitacion = params.get('invitacion');
  var sistema = 'windows';
  try { correo.value = localStorage.getItem('swap-correo') || ''; } catch (e) {}

  function sistemaProbable() {
    var ua = navigator.userAgent || '';
    return /Mac/i.test(navigator.platform || ua) ? 'mac' : 'windows';
  }

  function abrir(os) {
    sistema = nombres[os] ? os : 'windows';
    document.getElementById('descarga-sistema').textContent = nombres[sistema];
    estado.textContent = '';
    enlace.hidden = true;
    boton.disabled = false;
    if (!dialog.open) dialog.showModal();
    correo.focus();
  }

  function abrirInvitacion() {
    document.getElementById('descarga-ceja').textContent = 'INVITACIÓN · SWAP PRO';
    document.getElementById('descarga-titulo').textContent = 'Tu acceso a swap Pro';
    document.getElementById('descarga-texto').textContent =
      'Deja tu correo y elige tu computador: activamos Pro para ese correo y la descarga empieza al tiro. ' +
      'Después abre swap y entra con ese mismo correo (o con tu Google).';
    boton.textContent = 'Activar Pro y descargar';
    grupoOs.hidden = false;
    var probable = sistemaProbable();
    grupoOs.querySelector('input[value="' + probable + '"]').checked = true;
    estado.textContent = '';
    if (!dialog.open) dialog.showModal();
    correo.focus();
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    var m = /\/swap\/(windows|mac|intel)(?:$|[?#])/.exec(link.getAttribute('href'));
    if (!m || /[?&]t=/.test(link.getAttribute('href'))) return;
    event.preventDefault();
    if (invitacion) {
      abrirInvitacion();
      grupoOs.querySelector('input[value="' + m[1] + '"]').checked = true;
    } else {
      abrir(m[1]);
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    var os = invitacion ? (form.querySelector('input[name=os]:checked') || {}).value : sistema;
    boton.disabled = true;
    enlace.hidden = true;
    estado.textContent = invitacion ? 'Activando tu acceso Pro…' : 'Preparando tu descarga…';
    var controlador = new AbortController();
    var timeout = setTimeout(function () { controlador.abort(); }, 20000);
    fetch(invitacion ? '/api/swap-invitacion' : '/api/swap-descarga', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: controlador.signal,
      body: JSON.stringify({ email: correo.value, os: os, codigo: invitacion || undefined, web: form.elements.web.value })
    }).then(async function (response) {
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'No pudimos preparar la descarga. Inténtalo nuevamente.');
      return data;
    }).then(function (r) {
      if (!r.url) throw new Error(r.error || 'No pudimos preparar la descarga.');
      var destino = new URL(r.url, location.origin);
      if (destino.origin !== location.origin || destino.pathname !== '/swap/' + os) throw new Error('El enlace de descarga no es válido. Escríbenos a soporte@iceroom.cl.');
      try { localStorage.setItem('swap-correo', correo.value.trim()); } catch (e) {}
      estado.textContent = invitacion
        ? 'Listo: Pro quedó activo para ' + r.email + '. Tu descarga empieza ahora; entra a swap con ese correo.'
        : 'Tu descarga está lista. Si no comienza, usa el enlace de abajo. Entra a swap con este mismo correo.';
      enlace.href = destino.href;
      enlace.hidden = false;
      boton.textContent = 'Generar otro enlace';
      window.location.href = destino.href;
    }).catch(function (error) {
      estado.textContent = error.name === 'AbortError'
        ? 'La conexión tardó demasiado. Puedes volver a intentarlo; si pediste Pro, se conserva tu mismo acceso.'
        : error.message || 'No pudimos preparar la descarga. Inténtalo de nuevo.';
    }).finally(function () {
      clearTimeout(timeout);
      boton.disabled = false;
    });
  });

  dialog.querySelector('.dialog-close').addEventListener('click', function () { dialog.close(); });
  if (invitacion) abrirInvitacion();
  else if (params.get('descargar')) abrir(params.get('descargar'));
})();
