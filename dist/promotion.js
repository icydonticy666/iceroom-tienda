(() => {
  'use strict';
  let state = {active:false, products:{}};
  let deadline = 0;
  let clock = 0;
  const usd = cents => '$' + (cents / 100).toFixed(2);
  function render() {
    document.body.classList.toggle('cyber-active', state.active);
    document.querySelectorAll('[data-cyber]').forEach(el => {el.hidden = !state.active;});
    document.querySelectorAll('.badge').forEach(el => {
      if (!el.dataset.originalLabel) el.dataset.originalLabel=el.textContent;
      if (/ahorra/i.test(el.dataset.originalLabel)) el.textContent=state.active?'CYBER −25%':el.dataset.originalLabel;
    });
    document.querySelectorAll('a[data-mp]').forEach(link => {
      const product = state.products[link.dataset.mp];
      if (!product) return;
      const item = link.closest('article,.bundle-inner,.news-item');
      const price = item?.querySelector('.price');
      if (!price || price.hidden) return;
      price.textContent = usd(product.usd);
      let previous = item.querySelector('.cyber-previous');
      if (!previous) {previous = document.createElement('del'); previous.className='cyber-previous'; price.after(previous);}
      previous.textContent = usd(product.regularUsd); previous.hidden = !state.active;
      let badge = item.querySelector('.cyber-tag');
      if (!badge && !item.classList.contains('preview-panel') && !item.hidden) {
        badge=document.createElement('span'); badge.className='cyber-tag'; badge.textContent='CYBER −25%';
        const target=item.querySelector('.card-body h3,.txt h2,.news-tag');
        if (target) target.before(badge);
      }
      if (badge) badge.hidden = !state.active;
    });
    const kicker=document.querySelector('#contenido>.kicker');
    if (kicker) kicker.textContent=state.active?'Cyber Day · 72 horas':'Tienda · Productos digitales';
    document.querySelectorAll('[data-cyber-end]').forEach(el => {
      el.textContent='Hasta el '+new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(state.endsAt))+' · hora de Chile';
    });
    window.dispatchEvent(new Event('iceroom:promotion'));
  }
  function tick() {
    if (!state.active) return;
    const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    const hours = String(Math.floor(remaining / 3600)).padStart(2,'0');
    const minutes = String(Math.floor(remaining % 3600 / 60)).padStart(2,'0');
    const seconds = String(remaining % 60).padStart(2,'0');
    document.querySelectorAll('[data-cyber-clock]').forEach(el => {el.textContent=hours+':'+minutes+':'+seconds;});
    if (!remaining) {
      state.active=false;
      Object.values(state.products).forEach(product=>{product.usd=product.regularUsd;product.clp=product.regularClp;});
      clearInterval(clock); render();
    }
  }
  const ready = fetch('/api/promotion',{cache:'no-store'}).then(response=>{
    if (!response.ok) throw new Error('promotion unavailable'); return response.json();
  }).then(data=>{
    state=data;
    deadline=performance.now()+Math.max(0,Date.parse(data.endsAt)-Date.parse(data.serverTime));
    render(); tick(); if (state.active) clock=setInterval(tick,1000);
    return state;
  }).catch(()=>state);
  window.iceroomPromotion={get:()=>state,ready};
  document.addEventListener('visibilitychange',()=>{if (!document.hidden) tick();});
})();
