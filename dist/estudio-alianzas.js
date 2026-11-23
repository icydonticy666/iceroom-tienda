// Panel /estudio: acceso para productores a lo último de Pritti + SWAP Pro (23-nov-2026). Usa la misma clave de la pestaña.
(() => {
  const $ = (id) => document.getElementById(id);
  const seccion = $('vista-alianzas'), lista = $('vista-lista'), panel = $('panel');
  if (!seccion || !lista || !panel) return;
  const clave = () => { try { return sessionStorage.getItem('iceroom-estudio') || ''; } catch { return ''; } };
  const fecha = (iso) => iso ? new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }) : '—';
  function el(tag, props = {}, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
    for (const h of hijos) if (h) n.append(h);
    return n;
  }
  async function api(metodo, datos) {
    const r = await fetch('/api/alianzas', {
      method: metodo, cache: 'no-store',
      headers: { authorization: 'Bearer ' + clave(), ...(datos ? { 'content-type': 'application/json' } : {}) },
      body: datos ? JSON.stringify(datos) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Algo falló.');
    return j;
  }
  function copiar(texto, boton) {
    const ok = () => { const t = boton.textContent; boton.textContent = 'Copiado ✓'; setTimeout(() => { boton.textContent = t; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(ok, () => prompt('Copia el link:', texto));
    else prompt('Copia el link:', texto);
  }
  function pintar(alianzas) {
    const tbody = $('al-filas'); tbody.replaceChildren();
    for (const a of alianzas) {
      const boton = el('button', { type: 'button', class: 'pj-btn ghost', style: 'min-height:32px;padding:5px 12px', text: 'Copiar link' });
      boton.addEventListener('click', () => copiar(a.link, boton));
      const toggle = el('button', { type: 'button', class: 'pj-btn ' + (a.activa ? 'danger' : 'ghost'), style: 'min-height:32px;padding:5px 12px', text: a.activa ? 'Desactivar' : 'Activar' });
      toggle.addEventListener('click', async () => {
        if (a.activa && !confirm(`¿Desactivar el link de ${a.nombre}? Deja de descargar y su SWAP Pro sin usar se cierra.`)) return;
        try { await api('POST', { accion: 'activa', id: a.id, activa: !a.activa }); cargar(); } catch (err) { alert(err.message); }
      });
      const uso = `${a.visitas} visitas · ${a.descargas} descargas · SWAP Pro: ${a.swapActivado.length ? a.swapActivado.join(', ') : 'sin activar'}`;
      tbody.append(el('tr', {},
        el('td', {}, el('b', { text: a.nombre }), el('br'),
          el('small', { class: 'pj-hint', text: (a.contacto ? a.contacto + ' · ' : '') + 'creado ' + fecha(a.creado) + (a.activa ? '' : ' · DESACTIVADO') })),
        el('td', { class: 'es-hide', text: a.cupon ? `${a.cupon} (${a.descuento}%)` : '—' }),
        el('td', {}, el('small', { text: uso })),
        el('td', {}, el('div', { class: 'pj-btns' }, boton, toggle))));
    }
    $('al-vacio').classList.toggle('pj-hidden', alianzas.length > 0);
  }
  async function cargar() {
    try { pintar((await api('GET')).alianzas || []); }
    catch (err) { $('al-vacio').textContent = err.message; $('al-vacio').classList.remove('pj-hidden'); }
  }
  $('al-recargar').addEventListener('click', cargar);
  $('al-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target, msg = f.querySelector('.pj-msg'), b = f.querySelector('button[type=submit]');
    const datos = Object.fromEntries(new FormData(f).entries());
    b.disabled = true; msg.className = 'pj-msg'; msg.textContent = 'Creando…';
    try {
      const a = await api('POST', { accion: 'crear', ...datos });
      f.reset(); msg.textContent = '';
      const caja = $('al-nuevo'); caja.replaceChildren();
      const boton = el('button', { type: 'button', class: 'pj-btn accent', text: 'Copiar link' });
      boton.addEventListener('click', () => copiar(a.link, boton));
      caja.append(el('div', {}, el('b', { text: `Acceso listo para ${a.nombre}` }),
        el('small', { class: 'pj-hint', text: a.cupon ? `Código para su gente: ${a.cupon} (${a.descuento}% en toda la tienda)` : 'Sin código de descuento.' }),
        el('div', { class: 'pj-hint', style: 'word-break:break-all;margin-top:4px', text: a.link })), boton);
      caja.classList.remove('pj-hidden');
      cargar();
    } catch (err) { msg.className = 'pj-msg error'; msg.textContent = err.message; }
    finally { b.disabled = false; }
  });
  // Se muestra junto a la lista de proyectos y se carga al entrar al panel.
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
