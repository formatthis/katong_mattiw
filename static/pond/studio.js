'use strict';
(() => {
  const studio=window.FestivalArt.catalog.studio;
  let config={...studio.defaults},enabled=false;
  const form=document.getElementById('krathong-form');
  const isLantern=document.body.dataset.scene==='lantern';
  function current(){return enabled?{...config,enabled:true}:{};}
  function paint(){
    document.querySelectorAll('[data-studio-palette]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.studioPalette===config.color)));
    document.querySelectorAll('[data-studio-leaf]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.studioLeaf===config.leaf));
      button.querySelector('span').innerHTML=window.FestivalArt.spec('lotus',{...config,leaf:button.dataset.studioLeaf}).svg;
    });
    document.querySelectorAll('[data-studio-config]').forEach(input=>{input.value=String(config[input.dataset.studioConfig]);});
    document.dispatchEvent(new CustomEvent('studiochange'));
  }
  function setEnabled(value){
    enabled=value;
    if(enabled&&form.elements.style.value.startsWith('custom:'))form.querySelector('input[name=style]').checked=true;
    document.getElementById('preset-collection').hidden=enabled;
    document.getElementById('studio-controls').hidden=!enabled;
    document.querySelectorAll('[data-edit-mode]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.editMode==='studio')===enabled)));
    paint();
  }
  document.querySelectorAll('[data-edit-mode]').forEach(button=>button.addEventListener('click',()=>setEnabled(button.dataset.editMode==='studio')));
  document.querySelectorAll('[data-studio-palette]').forEach(button=>button.addEventListener('click',()=>{config.color=button.dataset.studioPalette;paint();}));
  document.querySelectorAll('[data-studio-leaf]').forEach(button=>button.addEventListener('click',()=>{config.leaf=button.dataset.studioLeaf;paint();}));
  document.querySelectorAll('[data-studio-config]').forEach(input=>input.addEventListener('input',()=>{
    const key=input.dataset.studioConfig;config[key]=['candles','incense'].includes(key)?Number(input.value):input.value;paint();
  }));
  window.KrathongStudio={current,reset(){config={...studio.defaults};setEnabled(false);},get enabled(){return enabled;}};
  document.querySelectorAll('[data-only-krathong]').forEach(node=>node.hidden=isLantern);
  // The app paints the large preview with the selected portrait after initialization.
  document.querySelectorAll('[data-studio-leaf]').forEach(button=>{
    button.querySelector('span').innerHTML=window.FestivalArt.spec('lotus',{...config,leaf:button.dataset.studioLeaf}).svg;
  });
})();
