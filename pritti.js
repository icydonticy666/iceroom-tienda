(function(){
  'use strict';
  var panel=document.getElementById('plugin-panel');
  var tabs=Array.from(document.querySelectorAll('[data-plugin]'));
  // Perillas del hero (lenguaje de las interfaces Pritti): eligen el plugin y bajan al explorador.
  var knobs=Array.from(document.querySelectorAll('[data-knob]'));
  knobs.forEach(function(knob){
    knob.addEventListener('click',function(){
      var tab=tabs.find(function(item){return item.dataset.plugin===knob.dataset.knob;});
      if(tab)tab.click();
      document.querySelector('.p-explorer')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    });
  });
  knobs[0]?.classList.add('is-active');
  var catalog=[],active='vocals';
  var uses={vocals:['PREAMP','EQ','COMPRESOR'],grip:['DINÁMICA','4 ESTILOS','COLOR'],backroom:['SPACE','DRY / WET','4 TIPOS'],eco:['TEMPO SYNC','FEEDBACK','4 FLAVORS'],riri:['VOCAL RISER','REVERSE REVERB','DRAG TO DAW']};
  function priceFor(key,fallback){var p=window.iceroomPromotion?.get().products[key];return p?p.usd:fallback;}
  function updatePrices(){
    var regular={Nqvbs:399,Vo0Sq:699,SQti3:499,'5JbVN':499,G5U1r:1999};
    document.querySelectorAll('[data-price-key]').forEach(function(el){
      var key=el.dataset.priceKey,cents=priceFor(key,regular[key]);
      if(Number.isFinite(cents)) el.textContent='US$'+(cents/100).toFixed(2);
    });
  }
  function render(id){
    var p=catalog.find(function(item){return item.id===id;});
    if(!p)return;
    active=id;
    panel.style.setProperty('--accent',p.accent);panel.style.setProperty('--accent-ink',p.ink);panel.style.setProperty('--wash',p.wash);
    tabs.forEach(function(tab){var selected=tab.dataset.plugin===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});
    knobs.forEach(function(knob){knob.classList.toggle('is-active',knob.dataset.knob===id);});
    document.documentElement.style.setProperty('--hero-accent',p.accent);
    var bar=tabs[0]&&tabs[0].parentElement,current=tabs.find(function(tab){return tab.dataset.plugin===id;});
    if(bar&&current&&bar.scrollWidth>bar.clientWidth)bar.scrollTo({left:current.offsetLeft-bar.clientWidth/2+current.offsetWidth/2,behavior:'smooth'});
    panel.setAttribute('aria-labelledby','tab-'+id);panel.classList.toggle('is-riri',id==='riri');
    document.getElementById('feature-number').textContent=p.number+' / PRITTI';
    document.getElementById('feature-status').textContent=p.badge;
    document.getElementById('feature-family').textContent=p.family;
    var name=document.getElementById('feature-name'),dot=document.createElement('span');dot.textContent='.';name.replaceChildren(document.createTextNode(p.name),dot);
    document.getElementById('feature-description').textContent=p.short;
    var list=document.getElementById('feature-uses');list.replaceChildren();
    uses[id].forEach(function(text){var tag=document.createElement('span');tag.textContent=text;list.appendChild(tag);});
    var image=document.getElementById('feature-image');image.src=p.image;image.alt=(id==='riri'?'Vista previa de ':'Interfaz de ')+'Pritti '+p.name;
    var zoom=panel.querySelector('[data-zoom]');zoom.dataset.zoom=p.image;zoom.dataset.zoomTitle=image.alt;zoom.setAttribute('aria-label','Ampliar '+image.alt);
    document.getElementById('feature-image-caption').textContent=id==='riri'?'VISTA PREVIA · BETA':'INTERFAZ DEL PLUGIN';
    var buy=document.getElementById('feature-buy'),price=document.getElementById('feature-price'),note=document.getElementById('feature-price-note');
    if(p.key){
      buy.dataset.mp=p.key;buy.dataset.usd='$'+(p.usd/100).toFixed(2);buy.href='/api/paypal-checkout?product='+p.key;buy.classList.add('payhip-buy-button');
      buy.replaceChildren(document.createTextNode('Elegir '+p.name+' ↗'));
      price.dataset.priceKey=p.key;price.textContent='US$'+(priceFor(p.key,p.usd)/100).toFixed(2);note.textContent='USD · pago único';
    }else{
      buy.removeAttribute('data-mp');buy.removeAttribute('data-usd');buy.classList.remove('payhip-buy-button');buy.href='#riri';buy.textContent='Conocer Riri fx ↓';
      price.removeAttribute('data-price-key');price.textContent='Beta';note.textContent='En beta · riser vocal y reverse reverb';
    }
    var more=document.getElementById('feature-more');more.href='#'+id;more.textContent='Conocer '+p.name+' ↓';more.hidden=id==='riri';
    panel.classList.remove('is-changing');void panel.offsetWidth;panel.classList.add('is-changing');
    if(p.key&&window.fbq)window.fbq('track','ViewContent',{content_ids:[p.key],content_type:'product',content_name:'Pritti '+p.name});
  }
  fetch('/pritti-products.json?v=20261104d').then(function(r){if(!r.ok)throw Error('catalog');return r.json();}).then(function(data){catalog=data;}).catch(function(){tabs.forEach(function(tab){tab.addEventListener('click',function(){location.hash=tab.dataset.plugin;});});});
  tabs.forEach(function(tab,index){
    tab.addEventListener('click',function(){render(tab.dataset.plugin);});
    tab.addEventListener('keydown',function(event){
      var next=index;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabs.length-1;
      else return;
      event.preventDefault();tabs[next].focus();render(tabs[next].dataset.plugin);
    });
  });
  window.addEventListener('iceroom:promotion',updatePrices);
  if(window.iceroomPromotion?.ready)window.iceroomPromotion.ready.then(updatePrices);
  updatePrices();
  var lightbox=document.getElementById('pritti-lightbox');
  document.addEventListener('click',function(event){
    var target=event.target.closest('[data-zoom]');if(!target)return;
    var image=document.getElementById('lightbox-image');image.src=target.dataset.zoom;image.alt=target.dataset.zoomTitle;
    document.getElementById('lightbox-title').textContent=target.dataset.zoomTitle;
    document.body.classList.add('p-zoom-open');lightbox.showModal();
  });
  lightbox.querySelector('button').addEventListener('click',function(){lightbox.close();});
  lightbox.addEventListener('click',function(event){if(event.target===lightbox)lightbox.close();});
  lightbox.addEventListener('close',function(){document.body.classList.remove('p-zoom-open');});
  if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}});},{threshold:.04});
    document.querySelectorAll('.p-reveal').forEach(function(el){el.classList.add('will-reveal');observer.observe(el);});
  }
  if((location.hostname==='iceroom.cl'||location.hostname==='www.iceroom.cl')&&!window.fbq){
    var fb=window.fbq=function(){fb.callMethod?fb.callMethod.apply(fb,arguments):fb.queue.push(arguments);};
    window._fbq=fb;fb.push=fb;fb.loaded=true;fb.version='2.0';fb.queue=[];
    var script=document.createElement('script');script.async=true;script.src='https://connect.facebook.net/en_US/fbevents.js';document.head.appendChild(script);
    fb('init','1428727309189220');fb('track','PageView');
  }
})();
