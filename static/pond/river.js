'use strict';
(() => {
  const pond = document.getElementById('pond');
  if (!pond || document.body.dataset.scene === 'lantern') return;
  const canvas = document.createElement('canvas');
  canvas.className = 'water-motion'; canvas.setAttribute('aria-hidden','true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  pond.prepend(canvas);
  const image = new Image();
  image.decoding = 'async';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let geometry, frame = 0, lastDraw = 0;
  const ripples = [];
  function resize() {
    if (!image.complete || !image.naturalWidth) return;
    const box = pond.getBoundingClientRect();
    const w = box.width, h = box.height;
    const ratio = Math.min(devicePixelRatio || 1,1.25,1200/w,1200/h);
    canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight);
    const sw=w/scale,sh=h/scale;
    const sx=(image.naturalWidth-sw)*.57,sy=(image.naturalHeight-sh)*.3;
    geometry={w,h,scale,sw,sh,sx,sy,waterY:Math.max(0,(image.naturalHeight*.385-sy)*scale)};
    draw(performance.now());
  }
  function draw(time) {
    if (!geometry) return;
    const {w,h,scale,sw,sx,sy,waterY}=geometry;
    ctx.clearRect(0,0,w,h);
    if(reduced.matches){return;}
    const seconds=time/1000;
    ctx.globalAlpha=.95;
    // Sample shallow rows of the photographic water. Their small, independent
    // offsets preserve the real reflections while adding changing wavelets.
    for(let y=waterY+2;y<h;y+=4){
      const depth=(y-waterY)/(h-waterY);
      const shift=(Math.sin(y*.065+seconds*1.15)*2.5+Math.sin(y*.14-seconds*1.8)*1.1)*depth;
      const rise=Math.sin(y*.04-seconds*.9)*.7*depth;
      const sourceHeight=Math.min(5/scale,image.naturalHeight);
      const sourceY=Math.max(0,Math.min(image.naturalHeight-sourceHeight,sy+(y+rise)/scale));
      ctx.drawImage(image,sx+shift/scale,sourceY,sw,sourceHeight,0,y,w,5);
    }
    ctx.globalAlpha=1;
    for(let index=ripples.length-1;index>=0;index--){
      const ripple=ripples[index],age=(time-ripple.at)/1000;
      if(age>2.5){ripples.splice(index,1);continue;}
      for(let ring=0;ring<3;ring++){
        const radius=age*(30+ring*12)+3;
        ctx.beginPath();ctx.ellipse(ripple.x,ripple.y,radius,radius*.26,0,0,Math.PI*2);
        ctx.strokeStyle=`rgba(240,214,153,${Math.max(0,(1-age/2.5)*.24-ring*.04)})`;
        ctx.lineWidth=.8;ctx.stroke();
      }
    }
  }
  function animate(time){
    if(document.hidden||reduced.matches){frame=0;return;}
    if(time-lastDraw>33){draw(time);lastDraw=time;}
    frame=requestAnimationFrame(animate);
  }
  function start(){cancelAnimationFrame(frame);draw(performance.now());if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(animate);}
  image.onload=()=>{
    pond.classList.add('has-temple-background');resize();start();
    new ResizeObserver(resize).observe(pond);
  };
  image.src=pond.dataset.background;
  pond.addEventListener('pointerdown',event=>{
    if(!geometry||reduced.matches)return;
    const box=pond.getBoundingClientRect(),y=event.clientY-box.top;
    if(y>geometry.waterY){ripples.push({x:event.clientX-box.left,y,at:performance.now()});if(ripples.length>8)ripples.shift();}
  },{passive:true});
  // Wake behind a krathong gliding away from the centre.
  pond.addEventListener('river-ripple',event=>{
    if(!geometry||reduced.matches)return;
    const {x,y}=event.detail||{};
    if(Number.isFinite(x)&&y>geometry.waterY){ripples.push({x,y,at:performance.now()});if(ripples.length>8)ripples.shift();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAnimationFrame(frame);else start();});
  reduced.addEventListener('change',start);
})();
