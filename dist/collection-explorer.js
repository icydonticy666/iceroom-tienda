(() => {
  'use strict';
  const items = {
    course: {name:'Masterclass: Mezcla Pro',image:'icycold.webp',portrait:true,description:'El proceso de icycold en dos temporadas: desde grabar la voz hasta trabajar una mezcla completa.',tags:['Grabación','Ecualización','Compresión','Balance','Sesiones reales']},
    fl: {name:'Plantilla FL Studio',image:'fl-logo.webp',description:'Sesión y cadenas de voz preparadas para grabar en FL Studio. Requiere plugins externos de pago.',tags:['Sesión .flp','Guía de uso']},
    ableton: {name:'Plantilla Ableton Live',image:'ableton-logo.svg',description:'Racks nativos y ruteos de grabación listos para trabajar las voces en Ableton.',tags:['Grabación vocal','Racks nativos']},
    vocals: {name:'Pritti Vocals',image:'vocals-ui.webp',description:'Brillo y presencia para encontrar el sonido de tu voz.',tags:['Vocal FX','Win + Mac']},
    backroom: {name:'Pritti Backroom',image:'backroom-ui.webp',description:'De un espacio íntimo a una reverb profunda alrededor de la voz.',tags:['Reverb','Win + Mac']},
    eco: {name:'Pritti Eco',image:'eco-ui.webp',description:'Ecos, repeticiones y modulación para dar profundidad a la voz.',tags:['Delay','Win + Mac']},
    grip: {name:'Pritti Grip',image:'grip-ui.webp',description:'Compresión vocal para mantener la voz al frente de la mezcla.',tags:['Compresor','Beta 0.9','Win + Mac']}
  };
  const kits = {
    masterclass:{intro:'Conoce lo que vas a aprender y el plugin incluido con la masterclass.',groups:[['El curso',['course']],['Plugin incluido',['vocals']]]},
    ultimate:{intro:'Curso completo, dos plantillas de grabación y dos plugins Pritti. Explora cada parte del pack.',groups:[['Curso',['course']],['2 plantillas',['fl','ableton']],['2 plugins',['vocals','backroom']]]},
    templates:{intro:'Las sesiones de FL Studio y Ableton juntas, con Pritti Vocals incluido.',groups:[['2 plantillas',['fl','ableton']],['Plugin incluido',['vocals']]]},
    studio:{intro:'Dos plantillas y el ecosistema Pritti: Vocals, Backroom, Eco y la beta de Grip.',groups:[['2 plantillas',['fl','ableton']],['4 plugins',['vocals','backroom','eco','grip']]]},
    pritti:{intro:'Explora las interfaces reales de los cuatro plugins incluidos actualmente en Pritti Bundle.',groups:[['Voz y compresión',['vocals','grip']],['Espacio y ecos',['backroom','eco']]]}
  };
  const dialog=document.getElementById('kit-dialog');
  if(!dialog || typeof dialog.showModal !== 'function') return;
  const tabs=document.getElementById('kit-tabs');
  const panel=document.getElementById('kit-content');
  let opener=null, sourceBuy=null, activeKit=null, checkingOut=false;
  const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;};
  function activate(index,focus=false){
    [...tabs.children].forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
    panel.setAttribute('aria-labelledby','kit-tab-'+index);
    const group=activeKit.groups[index];const grid=element('div','kit-grid'+(group[1].length===1?' single':''));
    group[1].forEach(key=>{
      const item=items[key];const card=element('article','kit-item');const image=element('div','kit-image'+(item.portrait?' portrait':''));
      const img=element('img');img.src='/img/art/'+item.image;img.alt=item.portrait?'icycold, instructor de la masterclass':'Vista de '+item.name;image.append(img);
      const copy=element('div','kit-item-copy');copy.append(element('h3','',item.name),element('p','',item.description));
      const tags=element('div','kit-tags');item.tags.forEach(tag=>tags.append(element('span','',tag)));copy.append(tags);card.append(image,copy);grid.append(card);
    });
    panel.replaceChildren(grid);if(focus)tabs.children[index].focus();
  }
  document.querySelectorAll('[data-kit]').forEach(button=>{button.hidden=false;button.addEventListener('click',()=>{
    opener=button;const card=button.closest('.card,.bundle-inner');sourceBuy=card.querySelector('a.buy[data-mp]');activeKit=kits[button.dataset.kit];checkingOut=false;
    document.getElementById('kit-title').textContent=card.querySelector('h3,h2').textContent;
    document.getElementById('kit-intro').textContent=activeKit.intro;
    dialog.querySelector('.kit-price').textContent=card.querySelector('.price').textContent;
    tabs.replaceChildren();activeKit.groups.forEach((group,index)=>{
      const tab=element('button','',group[0]);tab.type='button';tab.id='kit-tab-'+index;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','kit-content');
      tab.addEventListener('click',()=>activate(index));tab.addEventListener('keydown',event=>{
        let next=index;if(event.key==='ArrowRight')next=(index+1)%activeKit.groups.length;else if(event.key==='ArrowLeft')next=(index+activeKit.groups.length-1)%activeKit.groups.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=activeKit.groups.length-1;else return;
        event.preventDefault();activate(next,true);
      });tabs.append(tab);
    });
    activate(0);dialog.showModal();document.body.classList.add('kit-open');dialog.querySelector('.kit-close').focus();
  });});
  dialog.querySelector('.kit-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{document.body.classList.remove('kit-open');if(!checkingOut&&opener)opener.focus();});
  document.getElementById('kit-buy').addEventListener('click',()=>{if(!sourceBuy)return;checkingOut=true;dialog.close();sourceBuy.click();});
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  if(window.matchMedia('(hover: hover) and (pointer: fine)').matches&&!reduce.matches){
    document.querySelectorAll('.art-board').forEach(board=>{
      const card=board.closest('.card,.bundle-inner');if(!card)return;let frame=null;
      card.addEventListener('pointermove',event=>{if(reduce.matches)return;if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const b=card.getBoundingClientRect();board.style.setProperty('--art-rx',((.5-(event.clientY-b.top)/b.height)*5).toFixed(2)+'deg');board.style.setProperty('--art-ry',(((event.clientX-b.left)/b.width-.5)*5).toFixed(2)+'deg');frame=null;});},{passive:true});
      card.addEventListener('pointerleave',()=>{if(frame)cancelAnimationFrame(frame);frame=null;board.style.setProperty('--art-rx','0deg');board.style.setProperty('--art-ry','0deg');});
    });
  }
})();
