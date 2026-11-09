(function(){
  var dialog=document.getElementById('disponibilidad');
  var names={pro:'SWAP Pro · US$9.99',bundle:'Plantilla + SWAP Pro · US$19.99',free:'SWAP Free · Gratis'};
  document.querySelectorAll('[data-sale-pending]').forEach(function(link){
    link.addEventListener('click',function(event){
      if(link.hasAttribute('data-mp')) return;
      event.preventDefault();
      document.getElementById('availability-title').textContent=names[link.dataset.salePending];
      document.getElementById('availability-copy').textContent=link.dataset.salePending==='free'
        ? 'Estamos preparando la edición gratuita que resuelve versiones. Consulta su disponibilidad en ICEBOX. Si ya recibiste SWAP, tu enlace de descarga anterior sigue funcionando.'
        : 'Este acceso está en preparación. Consulta su disponibilidad con ICEROOM en ICEBOX antes de comprar. El precio mostrado corresponde al lanzamiento previsto.';
      dialog.showModal();
    });
  });
  window.iceroomSwapProducts = {};
  fetch('/api/swap-access', {cache:'no-store'}).then(function(response){
    if(!response.ok) throw new Error('unavailable');
    return response.json();
  }).then(function(config){
    Object.keys(config.plans || {}).forEach(function(plan){
      var item=config.plans[plan];
      if(!item.ready || !item.productKey || !item.paypalUrl) return;
      window.iceroomSwapProducts[item.productKey]={
        name:item.name, type:plan==='bundle'?'PLANTILLA + PLUGINS + SWAP PRO':'SOFTWARE · SWAP PRO',
        description:plan==='bundle'?'Tu sesión FL y el acceso Pro de SWAP en una compra.':'Acceso Pro de SWAP asociado a tu correo de compra.',
        includes:plan==='bundle'?['Plantilla de Grabación FL Studio','Pritti Vocals y Pritti Backroom','Acceso a SWAP Pro']:['Acceso a SWAP Pro','Windows y macOS'],
        requirements:plan==='bundle'?'Necesitas FL Studio y los plugins externos de pago de la plantilla. Esas licencias no están incluidas.':'Necesitas la versión de SWAP compatible con el acceso Pro. Los DAW y plugins de terceros se adquieren por separado.'
      };
      document.querySelectorAll('[data-sale-pending="'+plan+'"]').forEach(function(link){
        link.dataset.mp=item.productKey;link.dataset.usd='$'+(item.usd/100).toFixed(2);
        link.href=item.paypalUrl;link.classList.add('payhip-buy-button');
        var description=link.querySelector('small');
        if(description) description.textContent=plan==='bundle'?'Plantilla FL + Pritti Vocals y Backroom + SWAP Pro':'Acceso Pro · pago único';
        if(link.classList.contains('full')) link.innerHTML='Elegir medio de pago <span>↗</span>';
      });
      document.getElementById('swap-commerce-state').textContent='Elige tu acceso Pro';
      document.getElementById('swap-payment-status').textContent='PayPal · en Chile: Mercado Pago y Webpay según disponibilidad';
    });
  }).catch(function(){/* Ante un fallo se conserva la disponibilidad pendiente, sin iniciar pagos. */});
  dialog.querySelectorAll('button').forEach(function(button){button.addEventListener('click',function(){dialog.close();});});
  var views={version:{image:'dark-version',caption:'Detecta tu DAW. Prepara una copia.',alt:'Interfaz real de SWAP: resolver versiones'},plugins:{image:'dark-plugins',caption:'VST2 → VST3. Revisa qué puedes recuperar.',alt:'Interfaz real de SWAP: revisión de plugins'},presets:{image:'dark-presets',caption:'Tu cadena de Ableton. En el mixer de FL.',alt:'Interfaz real de SWAP: conversión de presets'}};
  views.presets.title='Tu cadena no se queda en un solo DAW.';
  views.presets.caption='De un rack de Ableton a un preset de mixer en FL Studio. Revisa qué plugins puedes llevar contigo.';
  views.version.title='La sesión llegó. Que la versión no te frene.';
  views.version.caption='Prepara una copia para tu instalación de FL Studio o Ableton. Revisa el resultado y conserva el original.';
  views.plugins.title='Recupera el trabajo detrás de cada ajuste.';
  views.plugins.caption='Repara referencias VST2 → VST3 compatibles. Necesitas el plugin instalado; los ajustes dependen del formato.';
  var keys=['version','plugins','presets'],current=0;
  var gallery=document.getElementById('swap-gallery');
  var lightbox=document.getElementById('gallery-lightbox');
  function showView(index){
    current=(index+keys.length)%keys.length;
    var key=keys[current],view=views[key];
    var image=document.getElementById('swap-app-image');image.src='/img/swap/'+view.image+'.webp?v=20261025e';image.alt=view.alt;
    image.classList.remove('gallery-changing');void image.offsetWidth;image.classList.add('gallery-changing');
    document.getElementById('app-caption').textContent=view.caption;
    document.getElementById('gallery-title').textContent=view.title;
    document.getElementById('gallery-tier').textContent=key==='presets'?'SWAP PRO':'SWAP FREE · GRATIS';
    document.getElementById('gallery-count').textContent='0'+(current+1)+' / 03';
    document.querySelectorAll('[data-view]').forEach(function(item){item.setAttribute('aria-pressed',String(item.dataset.view===key));});
    if(lightbox.open){var large=document.getElementById('gallery-large-image');large.src=image.src;large.alt=image.alt;}
  }
  document.querySelectorAll('[data-view]').forEach(function(button){
    var thumb=document.createElement('img');thumb.src='/img/swap/'+views[button.dataset.view].image+'.webp?v=20261025e';thumb.alt='';thumb.width=46;thumb.height=54;button.prepend(thumb);
    button.addEventListener('click',function(){showView(keys.indexOf(button.dataset.view));});
  });
  document.getElementById('app-caption').setAttribute('aria-live','polite');
  document.querySelector('.gallery-prev').addEventListener('click',function(){showView(current-1);});
  document.querySelector('.gallery-next').addEventListener('click',function(){showView(current+1);});
  gallery.addEventListener('keydown',function(event){if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();showView(current+(event.key==='ArrowRight'?1:-1));}});
  var start=null,swiped=false;
  gallery.addEventListener('pointerdown',function(event){if(event.pointerType!=='mouse')start={x:event.clientX,y:event.clientY};swiped=false;});
  gallery.addEventListener('pointerup',function(event){if(!start)return;var x=event.clientX-start.x,y=event.clientY-start.y;start=null;if(Math.abs(x)>45&&Math.abs(x)>Math.abs(y)){swiped=true;showView(current+(x<0?1:-1));}});
  gallery.addEventListener('pointercancel',function(){start=null;});
  document.querySelector('.gallery-zoom').addEventListener('click',function(){if(swiped){swiped=false;return;}var image=document.getElementById('swap-app-image'),large=document.getElementById('gallery-large-image');large.src=image.src;large.alt=image.alt;lightbox.showModal();});
  lightbox.querySelector('button').addEventListener('click',function(){lightbox.close();});
  lightbox.addEventListener('click',function(event){if(event.target===lightbox)lightbox.close();});
  lightbox.addEventListener('keydown',function(event){if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();showView(current+(event.key==='ArrowRight'?1:-1));}});
  document.querySelectorAll('a[href^="#"]').forEach(function(link){
    link.addEventListener('click',function(){
      if(link.hasAttribute('data-sale-pending')) return;
      var target=document.querySelector(link.getAttribute('href'));
      if(target) target.setAttribute('tabindex','-1');
    });
  });
})();
