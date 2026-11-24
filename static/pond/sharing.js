'use strict';
(() => {
  const $=selector=>document.querySelector(selector);
  const dialog=$('#share-dialog'),cache=new Map();
  let current=null,receiptItem=null,detailItem=null,layout='post',generation=0;
  const key=`khuenloy.last-wish.${document.body.dataset.scene}`;
  let restored=false;
  const canonical=item=>`${location.origin}/wish/${item.id}/`;
  const imageUrl=(item,type='post')=>`${location.origin}/wish/${item.id}/card.png?layout=${type}`;
  const facebook=item=>`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonical(item))}`;
  function prepare(item,type){
    const cacheKey=`${item.id}:${type}`;
    if(cache.has(cacheKey))return cache.get(cacheKey).promise;
    const entry={};cache.set(cacheKey,entry);
    entry.promise=fetch(imageUrl(item,type)).then(async response=>{
      if(!response.ok)throw Error('เตรียมภาพไม่สำเร็จ ลองกดใหม่อีกครั้ง');
      const blob=await response.blob();
      entry.file=new File([blob],`khuenloy-${item.id.slice(0,8)}-${type}.png`,{type:'image/png'});
      entry.url=URL.createObjectURL(blob);
      return entry;
    }).catch(error=>{cache.delete(cacheKey);throw error;});
    while(cache.size>6){const oldest=cache.keys().next().value;if(oldest===cacheKey)break;const old=cache.get(oldest);if(old.url)URL.revokeObjectURL(old.url);cache.delete(oldest);}
    return entry.promise;
  }
  async function show(item,preferred=''){
    if(!item)return;
    current=item;
    document.querySelectorAll('[data-card-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.cardLayout===layout)));
    const token=++generation;
    $('#share-title').textContent=item.kind==='lantern'?'โคมกับคำอธิษฐานของเรา':'กระทงกับคำอธิษฐานของเรา';
    $('#share-card-status').textContent='';$('#instagram-fallback').hidden=true;
    $('#share-card-preview').hidden=true;$('#share-card-loading').hidden=false;
    $('#share-facebook').href=facebook(item);
    $('#download-card').removeAttribute('href');$('#download-card').setAttribute('aria-disabled','true');
    $('#share-instagram').disabled=true;
    if(!dialog.open)dialog.showModal();
    try{
      const data=await prepare(item,layout);
      if(token!==generation)return;
      $('#share-card-preview').src=data.url;$('#share-card-preview').hidden=false;
      $('#share-card-preview').alt=`ภาพ${item.kind==='lantern'?'โคม':'กระทง'}พร้อมคำอธิษฐานของ ${item.name}`;
      $('#share-card-loading').hidden=true;
      $('#download-card').href=data.url;$('#download-card').download=data.file.name;$('#download-card').removeAttribute('aria-disabled');
      $('#share-instagram').disabled=false;
      if(preferred==='instagram')$('#share-card-status').textContent='ภาพพร้อมแล้ว กด Instagram เพื่อเลือกแอปที่ต้องการแชร์';
    }catch(error){
      if(token!==generation)return;
      $('#share-card-loading').hidden=true;$('#share-card-status').textContent=error.message;
    }
  }
  async function instagram(item,type=layout){
    const ready=cache.get(`${item.id}:${type}`);
    if(!ready?.file){await show(item,'instagram');return;}
    if(navigator.canShare&&navigator.share&&navigator.canShare({files:[ready.file]})){
      try{await navigator.share({files:[ready.file],title:'คืนลอย',text:item.wish});$('#share-card-status').textContent='ส่งภาพไปยังเมนูแชร์แล้ว';}
      catch(error){if(error.name==='AbortError')return;await show(item);$('#share-card-status').textContent='แชร์ตรงจากเครื่องนี้ไม่ได้ กดดาวน์โหลดภาพไปลง Instagram ได้เลย';$('#instagram-fallback').hidden=false;}
    }else{
      if(!dialog.open){layout=type;await show(item);}
      const anchor=document.createElement('a');anchor.href=ready.url;anchor.download=ready.file.name;anchor.click();
      $('#instagram-fallback').hidden=false;$('#share-card-status').textContent='อุปกรณ์นี้ให้บันทึกภาพก่อน แล้วเลือกภาพใน Instagram';
    }
  }
  function receipt(item){
    receiptItem=item;$('#my-krathong-card').hidden=false;
    $('#my-krathong-title').textContent=item.kind==='lantern'?'โคมของเรา':'กระทงของเรา';
    $('#receipt-name').textContent=item.name;$('#receipt-wish').textContent=item.wish;
    $('#receipt-art').replaceChildren(window.FestivalArt.element(item.style,item.portrait,item.design,item.appearance));
    $('#receipt-download').href=`${imageUrl(item,'post')}&download=1`;
    $('#receipt-facebook').href=facebook(item);
    try{localStorage.setItem(key,item.id);}catch{}
    prepare(item,'post').catch(()=>{});
  }
  function detail(item){
    detailItem=item;
    $('#detail-facebook').href=facebook(item);
    $('#detail-download').href=`${imageUrl(item,'post')}&download=1`;
    prepare(item,'post').catch(()=>{});
  }
  async function restore(records){
    if(restored)return;restored=true;
    let id;try{id=localStorage.getItem(key);}catch{return;}
    if(!/^[a-f0-9-]{36}$/i.test(id||''))return;
    const existing=records.find(item=>item.id===id);
    if(existing){receipt(existing);return;}
    try{const endpoint=document.body.dataset.scene==='lantern'?'/api/lanterns/':'/api/krathongs/';const response=await fetch(`${endpoint}${id}/`);if(response.ok)receipt((await response.json()).krathong);}catch{}
  }
  $('#share-close').addEventListener('click',()=>dialog.close());
  $('#share-instagram').addEventListener('click',()=>{if(current)instagram(current);});
  $('#receipt-instagram').addEventListener('click',()=>{if(receiptItem)instagram(receiptItem,'post');});
  $('#receipt-card-options').addEventListener('click',()=>show(receiptItem));
  $('#detail-instagram').addEventListener('click',()=>{if(detailItem)instagram(detailItem,'post');});
  $('#detail-card-options').addEventListener('click',()=>show(detailItem));
  $('#share-copy-link').addEventListener('click',async()=>{
    if(!current)return;
    try{await navigator.clipboard.writeText(canonical(current));$('#share-card-status').textContent='คัดลอกลิงก์แล้ว';}
    catch{$('#share-card-status').textContent=canonical(current);}
  });
  document.querySelectorAll('[data-card-layout]').forEach(button=>button.addEventListener('click',()=>{
    layout=button.dataset.cardLayout;
    document.querySelectorAll('[data-card-layout]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    if(current)show(current);
  }));
  window.KhuenLoyShare={show,receipt,detail,restore};
})();
