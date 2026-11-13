import { ARCHIVOS, regaloDe } from "../../_lib/regalos.js";

// /regalo/<token>: página del regalo con descargas directas (sin cuenta) y activación de SWAP Pro.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CABECERAS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
};

function pagina(titulo, cuerpo) {
  return `<!doctype html><html lang="es" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · iceroom</title><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#080808">
<link rel="icon" href="/favicon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Manrope:wght@700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/proyecto.css?v=20261112a">
<style>
.rg-files{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:10px}
.rg-files li{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border:1px solid var(--line-2);border-radius:14px;background:var(--panel-2)}
.rg-files b{display:block;font-size:15px}.rg-files small{color:var(--text-3);font-size:12px}
.rg-files .pj-btn{min-height:40px;padding:9px 16px;flex:none}
.rg-os{display:flex;gap:8px;flex-wrap:wrap}.rg-os label{display:flex!important;align-items:center;gap:8px;padding:10px 14px;border:1px solid var(--line-2);border-radius:999px;cursor:pointer;color:var(--text)!important}
.rg-os input{width:auto!important}
@media(max-width:560px){.rg-files li{flex-direction:column;align-items:stretch}.rg-files .pj-btn{width:100%}}
</style></head><body>
<header class="pj-top"><a class="pj-logo" href="/"><svg viewBox="0 0 84 81" aria-hidden="true"><path d="M16 0H68L84 26L42 81L0 26Z" fill="currentColor"/></svg>iceroom</a><small>Tu regalo</small></header>
<main class="pj-main">${cuerpo}</main></body></html>`;
}

export async function onRequestGet({ params }) {
  const regalo = await regaloDe(params.token);
  if (!regalo) {
    return new Response(pagina("Enlace no válido", `<section class="pj-card"><h1>Este enlace no es válido.</h1><p class="pj-sub">Revisa que lo copiaste completo o escríbenos a <a href="mailto:soporte@iceroom.cl">soporte@iceroom.cl</a>.</p></section>`), { status: 404, headers: CABECERAS });
  }
  const base = `/regalo/${encodeURIComponent(params.token)}`;
  const filas = regalo.archivos.map((clave) => {
    const a = ARCHIVOS[clave];
    return `<li><div><b>${esc(a.nombre)}</b><small>${esc(a.so)}</small></div><a class="pj-btn ghost" href="${base}/d/${encodeURIComponent(clave)}" download>Descargar ↓</a></li>`;
  }).join("");
  const swap = regalo.swapPro ? `
  <section class="pj-card">
    <h2>SWAP Pro</h2>
    <p class="pj-sub">Escribe tu correo y elige tu sistema: activamos SWAP Pro para ese correo y empieza la descarga. Después, en SWAP, entra con ese mismo correo (te llega un código) y Pro queda activo.</p>
    <form class="pj-form" id="rg-swap" style="margin-top:16px">
      <label>Tu correo<input type="email" name="email" autocomplete="email" required placeholder="tu@correo.com"></label>
      <div class="rg-os" role="radiogroup" aria-label="Sistema">
        <label><input type="radio" name="os" value="windows" checked> Windows</label>
        <label><input type="radio" name="os" value="mac"> Mac (M1–M4)</label>
        <label><input type="radio" name="os" value="intel"> Mac Intel</label>
      </div>
      <input type="text" name="web" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
      <div class="pj-btns"><button class="pj-btn accent" type="submit">Activar Pro y descargar SWAP</button></div>
      <p class="pj-msg" role="status"></p>
    </form>
  </section>
  <script>
  (function(){var f=document.getElementById('rg-swap');if(!f)return;f.addEventListener('submit',function(e){e.preventDefault();var m=f.querySelector('.pj-msg'),b=f.querySelector('button');b.disabled=true;m.className='pj-msg';m.textContent='Activando tu acceso Pro…';
  var os=(f.querySelector('input[name=os]:checked')||{}).value;
  fetch('${base}/swap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.elements.email.value,os:os,web:f.elements.web.value})})
  .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'No se pudo activar.');return j})})
  .then(function(j){m.className='pj-msg ok';m.textContent='¡Listo! SWAP Pro quedó activo para '+j.email+'. Tu descarga empieza ahora.';location.href=j.url})
  .catch(function(err){m.className='pj-msg error';m.textContent=err.message})
  .finally(function(){b.disabled=false})})})();
  </script>` : "";
  const cuerpo = `
  <section class="pj-card pj-compra">
    <p class="pj-eyebrow"><span class="pj-ok-dot" aria-hidden="true"></span> Regalo de iceroom</p>
    <h1>${esc(regalo.titulo)}</h1>
    <p class="pj-sub">${esc(regalo.detalle)} Descarga directa, sin crear cuenta.</p>
    <ul class="rg-files">${filas}</ul>
  </section>${swap}
  <p class="pj-hint">¿Problemas para instalar? Mira la <a href="/swap-ayuda">ayuda de instalación</a> o escribe a <a href="mailto:soporte@iceroom.cl">soporte@iceroom.cl</a>. Guarda este link: puedes volver a descargar cuando quieras.</p>`;
  return new Response(pagina(regalo.titulo, cuerpo), { headers: CABECERAS });
}
