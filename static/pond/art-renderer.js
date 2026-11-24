'use strict';
(() => {
  const catalog=JSON.parse(document.getElementById('art-catalog').textContent);
  const custom=new Map(JSON.parse(document.getElementById('custom-designs').textContent).map(item=>[item.id,item]));
  function spec(style,appearance={}){
    if(!appearance?.enabled)return catalog.styles[style]||catalog.styles.lotus;
    const studio=catalog.studio,config={...studio.defaults,...appearance};
    for(const key of ['color','leaf_color','candle_color'])if(!/^#[0-9a-f]{6}$/i.test(config[key]))config[key]=studio.defaults[key];
    let body,face;
    if(['paper','rose','sky'].includes(style)){
      body=studio.lantern;face={face_x:50,face_y:41,face_size:29};
    }else{
      body=studio.base+(studio.leaf_shapes[config.leaf]||studio.leaf_shapes.folded)
        +(studio.incense[config.incense]||'')+(studio.candles[config.candles]||'')
        +studio.front+(studio.decorations[config.decoration]||studio.decorations.flowers);
      face={face_x:50,face_y:61,face_size:26};
    }
    for(const key of ['color','leaf_color','candle_color'])body=body.replaceAll(`{${key}}`,config[key]);
    return {svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100" fill="none" stroke="none">${body}</svg>`,face};
  }
  function element(style='lotus',portrait=null,design=null,appearance={}){
    if(style.startsWith('custom:')){design=custom.get(style.split(':')[1]);style='custom';}
    const rendered=spec(style,appearance),root=document.createElement('span');
    root.className=`boat-art art-${Object.hasOwn(catalog.styles,style)?style:'custom'}`;
    if(['paper','rose','sky'].includes(style))root.classList.add('lantern-art');
    if(style==='custom'&&design){
      root.classList.add('custom-design');
      const img=document.createElement('img');img.className='design-image';img.src=design.image;img.alt='';root.append(img);
    }else root.innerHTML=rendered.svg;
    if(portrait){
      const image=document.createElement('img'),face=design||rendered.face;
      image.src=portrait;image.alt='';image.decoding='async';image.className='boat-portrait custom-portrait';
      image.style.left=`${face.face_x}%`;image.style.top=`${face.face_y}%`;image.style.width=`${face.face_size}%`;
      image.style.height='auto';image.style.aspectRatio='1';image.style.transform='translate(-50%,-50%)';
      root.append(image);
    }
    return root;
  }
  window.FestivalArt={spec,element,catalog};
})();
