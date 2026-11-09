(function(){
  var root=document.querySelector('.swap-spotlight');
  if(!root) return;
  var views={
    version:{image:'dark-version',alt:'Interfaz real de SWAP Free para preparar proyectos en otra versión',caption:'Otra versión del DAW. Una copia para seguir.',count:'01 / 02'},
    plugins:{image:'dark-plugins',alt:'Interfaz real de SWAP Free para revisar referencias de plugins',caption:'Tienes VST3. Tu sesión busca VST2. Revisa qué puedes recuperar.',count:'02 / 02'}
  };
  var buttons=Array.from(root.querySelectorAll('[data-home-swap]'));
  function select(button){
    var view=views[button.dataset.homeSwap],image=root.querySelector('#home-swap-image');
    image.src='/img/swap/'+view.image+'.webp?v=20261025e';image.alt=view.alt;
    root.querySelector('#home-swap-caption').textContent=view.caption;
    root.querySelector('#home-swap-count').textContent=view.count;
    buttons.forEach(function(item){item.setAttribute('aria-pressed',String(item===button));});
    image.classList.remove('spotlight-image-in');void image.offsetWidth;image.classList.add('spotlight-image-in');
  }
  buttons.forEach(function(button,index){
    button.addEventListener('click',function(){select(button);});
    button.addEventListener('keydown',function(event){
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
      event.preventDefault();var next=buttons[(index+1)%buttons.length];select(next);next.focus();
    });
  });
})();
