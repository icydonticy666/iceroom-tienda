// Panel /estudio: postulaciones a las membresías ICYCOLD (27-nov-2026). Usa la misma clave de la pestaña.
(() => {
  const $ = (id) => document.getElementById(id);
  const seccion = $('vista-icycold'), lista = $('vista-lista'), panel = $('panel');
  if (!seccion || !lista || !panel) return;
  const clave = () => { try { return sessionStorage.getItem('iceroom-estudio') || ''; } catch { return ''; } };
  const fecha = (iso) => iso ? new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }) : '—';
  const PRECIO = { cl: { 'mix-master': 89990, 'recording-mix': 119990, 'full-remoto': 119990, 'full-presencial': 149990, 'artist-dev': 189990 }, int: { 'mix-master': 65, 'full-remoto': 99, 'artist-dev': 149 } };
  const precio = (p) => p.region === 'int'
    ? `desde US$${PRECIO.int[p.plan] ?? '?'} / mes`
    : `1er mes $${((PRECIO.cl[p.plan] || 0) - 10000).toLocaleString('es-CL')}, luego $${(PRECIO.cl[p.plan] || 0).toLocaleString('es-CL')}`;
  function el(tag, props = {}, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
    for (const h of hijos) if (h) n.append(h);
    return n;
  }
  async function api(metodo, datos) {
    const r = await fetch('/api/icycold-postulacion', {
      method: metodo, cache: 'no-store',
      headers: { authorization: 'Bearer ' + clave(), ...(datos ? { 'content-type': 'application/json' } : {}) },
      body: datos ? JSON.stringify(datos) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Algo falló.');
    return j;
  }
  let todas = [], filtro = 'nueva';
  const esLink = (t) => /^https?:\/\/\S+$/i.test(t);
  function pintar() {
    const tbody = $('ic-filas'); tbody.replaceChildren();
    const filas = todas.filter((p) => (p.estado || 'nueva') === filtro);
    for (const p of filas) {
      const botones = el('div', { class: 'pj-btns' });
      const responder = el('a', { class: 'pj-btn ghost', style: 'min-height:32px;padding:5px 12px', href: `mailto:${p.email}?subject=${encodeURIComponent('Tu postulación a ' + p.planNombre + ' · ICYCOLD')}`, text: 'Responder' });
      botones.append(responder);
      for (const [estado, texto] of [['aceptada', 'Aceptar'], ['descartada', 'Descartar'], ['nueva', 'Volver a nuevas']]) {
        if (estado === (p.estado || 'nueva')) continue;
        const b = el('button', { type: 'button', class: 'pj-btn ghost', style: 'min-height:32px;padding:5px 12px', text: texto });
        b.addEventListener('click', async () => {
          try { await api('PATCH', { id: p.id, estado }); p.estado = estado; pintar(); } catch (err) { alert(err.message); }
        });
        botones.append(b);
      }
      const musica = esLink(p.musica) ? el('a', { href: p.musica, target: '_blank', rel: 'noopener noreferrer', style: 'word-break:break-all', text: p.musica }) : el('span', { text: p.musica });
      tbody.append(el('tr', {},
        el('td', {}, el('b', { text: p.nombre }), el('br'),
          el('small', { class: 'pj-hint', text: [p.artista, p.email, fecha(p.creado), p.pais].filter(Boolean).join(' · ') }),
          p.objetivo ? el('p', { class: 'pj-hint', style: 'margin:6px 0 0;white-space:pre-wrap', text: p.objetivo }) : null),
        el('td', {}, el('b', { text: p.planNombre }), el('br'), el('small', { class: 'pj-hint', text: (p.region === 'int' ? 'Internacional · ' : 'Chile · ') + precio(p) })),
        el('td', { class: 'es-hide' }, musica),
        el('td', {}, botones)));
    }
    $('ic-vacio').classList.toggle('pj-hidden', filas.length > 0);
  }
  async function cargar() {
    try { todas = (await api('GET')).postulaciones || []; pintar(); }
    catch (err) { $('ic-vacio').textContent = err.message; $('ic-vacio').classList.remove('pj-hidden'); }
  }
  for (const b of seccion.querySelectorAll('[data-ic-filtro]')) b.addEventListener('click', () => {
    filtro = b.dataset.icFiltro;
    for (const o of seccion.querySelectorAll('[data-ic-filtro]')) o.setAttribute('aria-pressed', String(o === b));
    pintar();
  });
  $('ic-recargar').addEventListener('click', cargar);
  let cargado = false;
  const sync = () => {
    const ver = !lista.classList.contains('pj-hidden') && !panel.classList.contains('pj-hidden');
    seccion.classList.toggle('pj-hidden', !ver);
    if (ver && !cargado) { cargado = true; cargar(); }
  };
  new MutationObserver(sync).observe(lista, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
  sync();
})();

// Membresías pagadas con Flow (Chile).
(() => {
  const $ = (id) => document.getElementById(id);
  const seccion = $('vista-icycold-pagas'), lista = $('vista-lista'), panel = $('panel');
  if (!seccion || !lista || !panel) return;
  const clave = () => { try { return sessionStorage.getItem('iceroom-estudio') || ''; } catch { return ''; } };
  const clp = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
  const fecha = (iso) => iso ? new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }) : '—';
  const ESTADO = { activa: 'Activa', cancelada: 'Cancelada', cobro_pendiente: 'Primer cobro pendiente', cobrando: 'Cobrando…', tarjeta: 'Sin pagar' };
  const msg = (t) => { $('icm-msg').textContent = t; };
  function el(tag, props = {}, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
    for (const h of hijos) if (h) n.append(h);
    return n;
  }
  async function api(metodo, datos) {
    const r = await fetch('/api/icycold-membresias', {
      method: metodo, cache: 'no-store',
      headers: { authorization: 'Bearer ' + clave(), ...(datos ? { 'content-type': 'application/json' } : {}) },
      body: datos ? JSON.stringify(datos) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Algo falló.');
    return j;
  }
  function pintar(filas) {
    const tbody = $('icm-filas'); tbody.replaceChildren();
    for (const m of filas) {
      const botones = el('div', { class: 'pj-btns' });
      botones.append(el('a', { class: 'pj-btn ghost', style: 'min-height:32px;padding:5px 12px', href: `mailto:${m.email}?subject=${encodeURIComponent('Tu membresía ' + m.planNombre + ' · ICYCOLD')}`, text: 'Escribir' }));
      if (m.estado === 'activa') {
        for (const [inmediato, texto, aviso] of [[false, 'Cancelar a fin de mes', '¿Cancelar la membresía de ' + m.nombre + '? No se le cobra el mes siguiente.'],
          [true, 'Cancelar ya (garantía)', '¿Cancelar YA la membresía de ' + m.nombre + '? Recuerda devolver el pago en el panel de Flow.']]) {
          const b = el('button', { type: 'button', class: 'pj-btn ghost', style: 'min-height:32px;padding:5px 12px', text: texto });
          b.addEventListener('click', async () => {
            if (!confirm(aviso)) return;
            try { await api('POST', { accion: 'cancelar', id: m.id, inmediato }); cargar(); } catch (err) { alert(err.message); }
          });
          botones.append(b);
        }
      }
      tbody.append(el('tr', {},
        el('td', {}, el('b', { text: m.nombre }), el('br'),
          el('small', { class: 'pj-hint', text: [m.artista, m.email, fecha(m.creado), m.pais].filter(Boolean).join(' · ') }),
          m.objetivo ? el('p', { class: 'pj-hint', style: 'margin:6px 0 0;white-space:pre-wrap', text: m.objetivo }) : null,
          m.musica ? el('p', { class: 'pj-hint', style: 'margin:6px 0 0;word-break:break-all', text: m.musica }) : null),
        el('td', {}, el('b', { text: m.planNombre }), el('br'),
          el('small', { class: 'pj-hint', text: `1er mes ${clp(m.primer_monto)} · luego ${clp(m.precio)} / mes` })),
        el('td', { class: 'es-hide' }, el('span', { text: ESTADO[m.estado] || m.estado }),
          m.tarjeta ? el('br') : null, m.tarjeta ? el('small', { class: 'pj-hint', text: m.tarjeta }) : null,
          m.nota ? el('p', { class: 'pj-hint', style: 'margin:6px 0 0', text: m.nota }) : null),
        el('td', {}, botones)));
    }
    $('icm-vacio').classList.toggle('pj-hidden', filas.length > 0);
  }
  async function cargar() {
    try { pintar((await api('GET')).membresias || []); }
    catch (err) { $('icm-vacio').textContent = err.message; $('icm-vacio').classList.remove('pj-hidden'); }
  }
  $('icm-recargar').addEventListener('click', cargar);
  $('icm-planes').addEventListener('click', async () => {
    if (!confirm('¿Crear en Flow los 5 planes mensuales de ICYCOLD? Se hace una sola vez.')) return;
    msg('Creando planes…');
    try {
      const { planes } = await api('POST', { accion: 'crear-planes' });
      msg(planes.map((p) => `${p.plan}: ${p.ok ? 'creado' : 'error (' + p.error + ')'}`).join(' · '));
    } catch (err) { msg(err.message); }
  });
  let cargado = false;
  const sync = () => {
    const ver = !lista.classList.contains('pj-hidden') && !panel.classList.contains('pj-hidden');
    seccion.classList.toggle('pj-hidden', !ver);
    if (ver && !cargado) { cargado = true; cargar(); }
  };
  new MutationObserver(sync).observe(lista, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
