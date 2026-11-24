'use strict';
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const form = $('#krathong-form');
  const pond = $('#pond');
  const layer = $('#krathong-layer');
  const isLantern = document.body.dataset.scene === 'lantern';
  const objectName = isLantern ? 'โคม' : 'กระทง';
  const endpoint = new URL(form.dataset.feedUrl || form.action, location.origin).href;
  const submitLabel = isLantern ? 'ปล่อยโคม' : 'ลอยกระทงใบนี้';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const items = new Map();
  const pairGroups = new Map();
  let activePair = JSON.parse($('#pair-session-data').textContent);
  let pairSignature = '';
  let pairRefreshing = false;
  let cardsSignature = '';
  let previewURL = null;
  let activeWish = null;
  let submitting = false;
  let refreshing = false;
  let toastTimer;
  let firstLoad = true;
  let revision = 0;
  // Couple launch: both press within the window, then a shared server moment.
  let clockOffset = 0;
  let clockSynced = false;
  let soloPreviewDismissed = false;
  let countdownRoom = null;
  let launchedRoom = null;
  let readyDeadline = {host: 0, guest: 0};
  let readyTicker = 0;
  let pairTimer = 0;
  let pressing = false;
  const coverSignature = {1: '', 2: ''};
  // A server still serving an older cached page lacks these; keep the pond working anyway.
  const hasTogetherUI = !!($('#pair-cover') && $('#pair-countdown') && $('#ceremony-blessing'));
  const sharedWish = JSON.parse($('#shared-wish-data').textContent);
  const formatter = new Intl.DateTimeFormat('th-TH', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
  const light = isLantern ? 'แสงโคม' : 'แสงเทียน';
  const coupleBlessings = [
    `ขอให้ความรักของทั้งสองคนอบอุ่นเหมือน${light}คืนนี้ ลอยเคียงกันไปทุกคืนวันเพ็ญ`,
    'ขอให้จับมือกันผ่านทุกเรื่องได้เสมอ วันไหนเหนื่อยก็มีกันและกันเป็นที่พัก',
    `ขอให้คำอธิษฐานของทั้งสองคนสมหวังพร้อมกัน เหมือนที่ได้ลอย${objectName}พร้อมกันคืนนี้`,
    'ขอให้ทุกปีมีคืนแบบนี้อีก ได้หัวเราะด้วยกันมากกว่าเดิม และเข้าใจกันมากขึ้นทุกวัน',
    'ขอให้สายน้ำพาสิ่งไม่ดีออกไป เหลือไว้แต่ความรัก ความสุข และความสบายใจของทั้งคู่',
    `ขอให้หัวใจสองดวงสว่างไปด้วยกันเหมือน${light}ที่ส่องอยู่เคียงกัน`,
  ];
  const soloBlessings = [
    `ขอให้${light}คืนนี้นำทางไปสู่สิ่งที่ตั้งใจ สมหวังทุกประการ`,
    'ขอให้สายน้ำพาความกังวลออกไป เหลือไว้แต่ใจที่เบาสบายและเรื่องดี ๆ ที่กำลังมา',
    'ขอให้ปีนี้ใจดีกับตัวเองมากขึ้น และได้เจอคนที่ทำให้ยิ้มได้ทุกวัน',
    'ขอให้สุขภาพแข็งแรง งานราบรื่น และมีเวลาพักใจในทุกวัน',
    `ขอให้คำอธิษฐานนี้ลอยไปถึงฝั่ง และกลับมาเป็นความสุขให้เราเร็ว ๆ นะ`,
  ];
  function blessing(seed, couple) {
    const list = couple ? coupleBlessings : soloBlessings;
    let hash = 0;
    for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return list[hash % list.length];
  }

  function boat(style = 'lotus', portrait = null, design = null, appearance = {}) {
    return window.FestivalArt.element(style, portrait, design, appearance);
  }
  function ripple(x, y) {
    pond.dispatchEvent(new CustomEvent('river-ripple', {detail:{x, y}}));
  }
  function syncClock(serverNow, sentAt, receivedAt) {
    const server = Date.parse(serverNow || '');
    if (!Number.isNaN(server)) { clockOffset = server - (sentAt + receivedAt) / 2; clockSynced = true; }
  }
  function toClientTime(iso) { return Date.parse(iso) - clockOffset; }

  function setPreview() {
    const style = form.elements.style.value;
    const appearance = window.KrathongStudio.current();
    $('#preview-boat').replaceChildren(boat(style, previewURL, null, appearance));
    $('#studio-preview-art').replaceChildren(boat(style, previewURL, null, appearance));
    $('#selected-style').textContent = $('input[name="style"]:checked', form).closest('label').querySelector('.style-name').textContent;
    renderStage();
  }
  $$('.style-art').forEach(node => node.append(boat(node.dataset.style)));
  $$('input[name=style]').forEach(input => input.addEventListener('change', setPreview));
  document.addEventListener('studiochange', setPreview);
  function filterDesigns(category) {
    $$('.style-option', form).forEach(option => {
      option.hidden = category !== 'all' && option.dataset.group !== category;
    });
    $$('.design-filters button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.category === category));
    });
    $('#design-gallery').scrollTop = 0;
  }
  $$('.design-filters button').forEach(button => button.addEventListener('click', () => filterDesigns(button.dataset.category)));
  $$('[data-wish]').forEach(button => button.addEventListener('click', () => {
    $('#wish').value = button.dataset.wish;
    $('#wish').dispatchEvent(new Event('input', {bubbles:true}));
  }));

  function canJoinPair() {
    return activePair?.viewer_role === 'visitor' && activePair?.status === 'waiting';
  }
  function isMember() {
    return activePair?.viewer_role === 'host' || activePair?.viewer_role === 'guest';
  }
  function effectiveStage(state = activePair) {
    if (!state) return null;
    return launchedRoom === state.id ? 'launched' : state.stage;
  }
  function modeIsCouple() {
    return !!activePair || form.elements.mode.value === 'couple';
  }

  // ---------- Pond stage: big solo preview or the framed couple cover ----------
  function draftItem() {
    return {style: form.elements.style.value, portrait: previewURL, design: null,
      appearance: window.KrathongStudio.current(), name: $('#name').value.trim() || 'เรา'};
  }
  function placeholder() {
    const node = document.createElement('span'); node.className = 'cover-placeholder';
    node.innerHTML = '<svg aria-hidden="true"><use href="#i-heart"/></svg><b>?</b>';
    return node;
  }
  function setCoverSlot(slot, item) {
    const art = $(`#cover-art-${slot}`);
    const signature = item ? JSON.stringify([item.style, item.portrait, item.design?.id, item.appearance]) : 'empty';
    if (signature !== coverSignature[slot]) {
      coverSignature[slot] = signature;
      art.replaceChildren(item ? boat(item.style, item.portrait, item.design, item.appearance) : placeholder());
    }
    $(`#cover-slot-${slot}`).classList.toggle('is-empty', !item);
  }
  function renderCover() {
    if (!hasTogetherUI) return;
    const draftCouple = !activePair && form.elements.mode.value === 'couple';
    const state = activePair;
    const stage = draftCouple ? 'draft' : effectiveStage(state);
    const host = state?.participants.find(item => item.pair_slot === 1);
    const guest = state?.participants.find(item => item.pair_slot === 2);
    const left = host || (draftCouple ? draftItem() : null);
    const right = guest || (canJoinPair() ? draftItem() : null);
    setCoverSlot(1, left); setCoverSlot(2, right);
    $('#cover-names-1').textContent = left?.name || 'เรา';
    $('#cover-names-2').textContent = right?.name || 'อีกคน';
    const now = Date.now();
    const role = state?.viewer_role;
    const mine = role === 'host' ? 'host' : 'guest';
    const theirs = role === 'host' ? 'guest' : 'host';
    const partner = role === 'host' ? guest : host;
    const myReady = isMember() && readyDeadline[mine] > now;
    const theirReady = isMember() && readyDeadline[theirs] > now;
    const ready = {1: readyDeadline.host > now, 2: readyDeadline.guest > now};
    for (const slot of [1, 2]) {
      const chip = $(`#cover-ready-${slot}`);
      const present = slot === 1 ? !!left : !!right;
      const live = stage === 'gathering' || stage === 'countdown';
      chip.hidden = !present;
      chip.textContent = live ? (ready[slot] ? 'กดแล้ว ✓' : 'ยังไม่กด') : (slot === 1 ? (host ? 'คนชวน' : 'ของเรา') : guest ? 'คู่ลอย' : right ? 'ของเรา' : 'รออีกคน');
      chip.classList.toggle('is-ready', live && ready[slot]);
      $(`#cover-slot-${slot}`).classList.toggle('is-ready', live && ready[slot]);
      $(`#cover-slot-${slot}`).classList.toggle('is-mine', isMember() && (slot === 1) === (role === 'host'));
    }
    let status = '';
    let showButton = false, label = 'กดลอยพร้อมกัน', hint = 'ทั้งสองคนต้องกดภายใน 20 วินาที';
    const readyWindow = Number(state?.ready_window) || 20;
    if (stage === 'draft') status = `เลือก${objectName}ของเรา แล้วส่งลิงก์ชวนอีกคน จากนั้นกดลอยพร้อมกัน นับ 3 2 1`;
    else if (stage === 'waiting') status = canJoinPair() ? `${host?.name || 'อีกคน'} รออยู่ ใส่รูปและคำอวยพรของเรา แล้วกดเข้าห้องลอยคู่` : 'ส่งลิงก์ให้อีกคนเข้ามา พอครบสองคนจะกดลอยพร้อมกันได้';
    else if (stage === 'gathering') {
      if (!isMember()) status = 'สองคนนี้กำลังจะลอยด้วยกัน';
      else {
        showButton = true;
        if (myReady && theirReady) { label = 'กำลังเริ่มนับ…'; hint = ''; status = 'กดพร้อมกันแล้ว!'; }
        else if (myReady) {
          const left = Math.ceil((readyDeadline[mine] - now) / 1000);
          label = `รอ ${partner?.name || 'อีกคน'} กด…`; hint = `เหลือ ${left} วินาที · แตะอีกครั้งเพื่อยกเลิก`;
          status = 'เรากดแล้ว ให้อีกคนกดในเวลานี้ แล้วจะนับ 3 2 1 พร้อมกัน';
        } else if (theirReady) {
          const left = Math.ceil((readyDeadline[theirs] - now) / 1000);
          label = 'กดลอยพร้อมกันเลย!'; hint = `${partner?.name || 'อีกคน'} กดแล้ว เหลือ ${left} วินาที`;
          status = `${partner?.name || 'อีกคน'} กดรอแล้ว กดตามเลย`;
        } else status = `ครบสองคนแล้ว กดพร้อมกันเพื่อลอย${objectName}คู่`;
      }
    } else if (stage === 'countdown') status = 'นับถอยหลังพร้อมกัน…';
    $('#cover-status').textContent = status;
    const button = $('#pair-launch');
    button.hidden = !showButton;
    $('#pair-launch-label').textContent = label;
    $('#pair-launch-hint').textContent = hint;
    button.classList.toggle('is-waiting', myReady && !theirReady);
    button.classList.toggle('partner-ready', theirReady && !myReady);
    const deadline = myReady ? readyDeadline[mine] : theirReady ? readyDeadline[theirs] : 0;
    button.style.setProperty('--left', deadline && Number.isFinite(deadline) ? String(Math.max(0, Math.min(1, (deadline - now) / (readyWindow * 1000)))) : '0');
    $('#pair-cover').dataset.stage = stage || '';
  }
  function renderStage() {
    const draftCouple = !activePair && form.elements.mode.value === 'couple';
    const stage = effectiveStage();
    const coverVisible = draftCouple || (!!activePair && ['waiting', 'gathering', 'countdown'].includes(stage)
      && !(stage === 'waiting' && !canJoinPair() && !isMember()));
    if (hasTogetherUI) $('#pair-cover').hidden = !coverVisible;
    $('#pond-preview').hidden = (hasTogetherUI && coverVisible) || !!activePair || soloPreviewDismissed;
    if (coverVisible) renderCover();
    for (const [id, group] of pairGroups) group.classList.toggle('room-pair', id === activePair?.id);
  }
  function updateModeUI() {
    const coupled = modeIsCouple();
    $('#portrait').required = coupled;
    $('#portrait-requirement').textContent = coupled ? 'ใส่รูปสำหรับลอยคู่' : 'ไม่ใส่ก็ได้';
    $('#mode-description').textContent = coupled
      ? 'ใส่รูปและคำอวยพรของเรา ส่งลิงก์ให้อีกคน แล้วกดลอยพร้อมกัน นับ 3 2 1'
      : `เลือก${objectName}ของเรา แล้วลอยได้เลย`;
    if (!submitting) $('span', $('#float-button')).textContent = activePair ? 'เข้าห้องลอยคู่' : coupled ? 'สร้างห้องลอยคู่ แล้วส่งลิงก์ชวน' : submitLabel;
    renderStage();
  }
  $$('input[name=mode]').forEach(input => input.addEventListener('change', updateModeUI));

  // ---------- Couple room ----------
  function memberCard(item) {
    const card = document.createElement('div'); card.className = 'pair-member';
    const art = document.createElement('div'); art.className = 'pair-member-art'; art.append(boat(item.style,item.portrait,item.design,item.appearance));
    const info = document.createElement('div');
    const label = document.createElement('span'); label.className = 'pair-member-label'; label.textContent = item.pair_slot === 1 ? 'คนชวน' : 'คนที่มาลอยด้วยกัน';
    const name = document.createElement('strong'); name.textContent = item.name;
    const wish = document.createElement('p'); wish.textContent = item.wish;
    info.append(label,name,wish); card.append(art,info); return card;
  }
  function applyReadiness(state) {
    const now = Date.now();
    for (const role of ['host', 'guest']) {
      const value = state.ready?.[role];
      readyDeadline[role] = value === true ? Infinity : Number(value) > 0 ? now + Number(value) * 1000 : 0;
    }
  }
  function ensureReadyTicker() {
    if (readyTicker) return;
    readyTicker = setInterval(() => {
      const now = Date.now();
      const live = activePair && effectiveStage() === 'gathering' && (readyDeadline.host > now || readyDeadline.guest > now);
      renderCover();
      if (!live) { clearInterval(readyTicker); readyTicker = 0; }
    }, 250);
  }
  function updatePairUI(state) {
    const previous = activePair;
    activePair = state;
    $('#pair-session-panel').hidden = !state;
    if (!state) { updateModeUI(); return; }
    const before = previous?.id === state.id ? {...readyDeadline} : {host: 0, guest: 0};
    applyReadiness(state);
    const editable = canJoinPair();
    const member = isMember();
    $('#float-mode').hidden = true;
    $('#participant-fields').hidden = !editable;
    $('#participant-fields').disabled = !editable || submitting;
    form.action = state.join_url;
    const host = state.participants.find(item => item.pair_slot === 1);
    const guest = state.participants.find(item => item.pair_slot === 2);
    const partner = state.viewer_role === 'host' ? guest : host;
    const stage = effectiveStage(state);
    const titles = {
      waiting: editable ? `${host?.name || 'อีกคน'} ชวนมาลอยด้วยกัน` : 'รออีกคนเข้ามาในห้อง',
      gathering: member ? 'ครบสองคนแล้ว กดลอยพร้อมกันเลย' : 'สองคนนี้กำลังจะลอยด้วยกัน',
      countdown: 'กำลังนับถอยหลัง 3 2 1',
      launched: 'ลอยข้างกันแล้ว',
      expired: 'ลิงก์นี้หมดเวลาแล้ว',
    };
    const descriptions = {
      waiting: editable ? `เลือก${objectName} ใส่รูป และเขียนคำอวยพรของเรา แล้วกดเข้าห้อง จากนั้นกดลอยพร้อมกัน` : 'ส่งลิงก์นี้ให้อีกคน พอเข้ามาครบแล้ว ทั้งสองคนกดปุ่ม “กดลอยพร้อมกัน” ในสระ',
      gathering: member ? 'กดปุ่ม “กดลอยพร้อมกัน” ในสระ ทั้งสองคนต้องกดภายใน 20 วินาที แล้วจะนับ 3 2 1 พร้อมกันทั้งสองเครื่อง' : 'รอให้ทั้งสองคนกดลอยพร้อมกัน',
      countdown: 'อย่าเพิ่งปิดหน้านี้นะ',
      launched: `แตะ${objectName}แต่ละใบเพื่ออ่านคำอวยพรของแต่ละคนได้เลย`,
      expired: 'เริ่มรอบใหม่แล้วส่งลิงก์ให้อีกคนได้เลย',
    };
    $('#pair-status-title').textContent = titles[stage] || '';
    $('#pair-status-description').textContent = descriptions[stage] || '';
    $('#pair-share').hidden = !(state.viewer_role === 'host' && stage === 'waiting');
    $('#pair-invite-link').value = new URL(state.invite_url, location.origin).href;
    const signature = JSON.stringify(state.participants);
    if (signature !== pairSignature) {
      $('#pair-members').replaceChildren(...state.participants.map(memberCard)); pairSignature = signature;
    }
    if (stage === 'launched' && countdownRoom !== state.id) {
      state.participants.forEach(item => addFloat(item));
      launchedRoom = state.id;
    }
    if (previous?.id === state.id) {
      if (previous.stage === 'waiting' && state.stage === 'gathering' && state.viewer_role === 'host') {
        notify(`${guest?.name || 'อีกคน'} เข้ามาแล้ว! กดลอยพร้อมกันได้เลย`);
        pond.scrollIntoView({behavior:'smooth', block:'center'});
      }
      const theirs = state.viewer_role === 'host' ? 'guest' : 'host';
      if (member && state.stage === 'gathering' && !(before[theirs] > Date.now()) && readyDeadline[theirs] > Date.now()) {
        notify(`${partner?.name || 'อีกคน'} กดแล้ว! กดลอยพร้อมกันเลย`);
      }
    }
    if (state.stage === 'gathering') ensureReadyTicker();
    maybeStartCountdown(state);
    updateModeUI();
    schedulePair();
  }
  async function refreshPair() {
    if (!activePair || pairRefreshing || submitting) return;
    pairRefreshing = true;
    try {
      const sent = Date.now();
      const response = await fetch(activePair.api_url, {cache:'no-store'});
      if (!response.ok) throw new Error('pair');
      const data = await response.json();
      syncClock(data.pair?.server_now, sent, Date.now());
      updatePairUI(data.pair);
    } catch { $('#pair-status-description').textContent = 'กำลังเชื่อมต่ออีกครั้ง ข้อมูลที่เขียนยังอยู่ครบ'; }
    finally { pairRefreshing = false; schedulePair(); }
  }
  function schedulePair() {
    clearTimeout(pairTimer);
    const stage = effectiveStage();
    if (!stage || stage === 'launched' || stage === 'expired') return;
    const fast = stage === 'gathering' || stage === 'countdown';
    pairTimer = setTimeout(() => { if (document.hidden) schedulePair(); else refreshPair(); }, fast ? 900 : 3000);
  }
  $('#copy-pair-link').addEventListener('click', async () => {
    const input = $('#pair-invite-link');
    try { await navigator.clipboard.writeText(input.value); $('#pair-link-status').textContent = 'คัดลอกแล้ว ส่งให้อีกคนได้เลย'; }
    catch { input.focus(); input.select(); $('#pair-link-status').textContent = 'เลือกลิงก์ไว้ให้แล้ว กดคัดลอกได้เลย'; }
  });
  $('#pair-launch')?.addEventListener('click', async () => {
    if (!activePair || pressing || !isMember()) return;
    const mine = activePair.viewer_role === 'host' ? 'host' : 'guest';
    const next = !(readyDeadline[mine] > Date.now());
    pressing = true;
    readyDeadline[mine] = next ? Date.now() + (Number(activePair.ready_window) || 20) * 1000 : 0;
    renderCover(); ensureReadyTicker();
    try {
      const body = new FormData(); body.set('ready', next ? '1' : '0');
      const sent = Date.now();
      const response = await fetch(activePair.ready_url, {method:'POST', body, headers:{'X-CSRFToken':form.elements.csrfmiddlewaretoken.value}});
      const data = await response.json();
      syncClock(data.pair?.server_now, sent, Date.now());
      if (data.pair) updatePairUI(data.pair);
      if (!response.ok) notify(data.message || 'กดไม่สำเร็จ ลองอีกครั้งนะ');
    } catch {
      readyDeadline[mine] = 0; renderCover();
      notify('เชื่อมต่อไม่ได้ ลองกดอีกครั้งนะ');
    } finally { pressing = false; }
  });

  // ---------- Synchronised 3 · 2 · 1 ----------
  let countdownTimer = 0;
  function maybeStartCountdown(state) {
    if (!state.launch_at || countdownRoom === state.id || launchedRoom === state.id) return;
    if (state.viewer_role === 'visitor' || !clockSynced) return;
    const launchAt = toClientTime(state.launch_at);
    if (Date.now() > launchAt + 8000) return;
    countdownRoom = state.id;
    runCountdown(launchAt, launchPair);
  }
  function runCountdown(launchAt, done) {
    if (!hasTogetherUI) { setTimeout(done, Math.max(0, launchAt - Date.now())); return; }
    const overlay = $('#pair-countdown');
    const number = $('#countdown-number');
    const sweep = $('#countdown-sweep');
    $('#pair-cover').classList.add('is-counting');
    overlay.hidden = false; overlay.classList.remove('is-go');
    pond.scrollIntoView({behavior:'smooth', block:'center'});
    let shown = null;
    const tick = () => {
      const left = launchAt - Date.now();
      if (left <= 0) {
        number.textContent = 'ลอย!'; overlay.classList.add('is-go');
        $('#countdown-caption').textContent = 'พร้อมกันทั้งสองคน';
        setTimeout(() => { overlay.hidden = true; overlay.classList.remove('is-go'); }, 1300);
        done();
        return;
      }
      const n = Math.ceil(left / 1000);
      const value = n > 3 ? '♡' : String(n);
      if (value !== shown) {
        shown = value;
        number.textContent = value;
        overlay.dataset.count = value;
        $('#countdown-caption').textContent = n > 3 ? 'กดพร้อมกันแล้ว! เตรียมตัว…' : 'ลอยพร้อมกันใน';
        for (const node of [number, sweep]) { node.classList.remove('tick'); void node.getBoundingClientRect(); node.classList.add('tick'); }
      }
      countdownTimer = setTimeout(tick, Math.min(100, left));
    };
    clearTimeout(countdownTimer);
    tick();
  }
  function launchPair() {
    const state = activePair;
    if (!state) return;
    launchedRoom = state.id;
    const arrivals = state.participants.map(item => {
      addFloat(item, true);
      return [item, $(`.floating-krathong[data-id="${item.id}"]`, layer)];
    });
    arrivals.forEach(([item, button], index) => depart($(`#cover-art-${item.pair_slot}`), button, index * 220));
    $('#pair-cover')?.classList.remove('is-counting');
    const own = state.participants.find(item => item.pair_slot === (state.viewer_role === 'host' ? 1 : 2));
    if (own) window.KhuenLoyShare.receipt(own);
    celebrate(own || state.participants[0], {couple: state.participants, seed: state.id});
    renderCards([...items.values()]);
    updatePairUI(state);
    setTimeout(refresh, 1500);
  }

  for (let i = 0; i < 22; i++) {
    const spark = document.createElement('i');
    spark.style.cssText = `left:${3 + Math.random() * 94}%;top:${25 + Math.random() * 65}%;--delay:${-Math.random() * 12}s;--drift:${10 + Math.random() * 25}px`;
    $('#fireflies').append(spark);
  }

  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }
  function fieldError(name, message) {
    const error = $(`[data-error="${name}"]`);
    if (error) error.textContent = message;
    const control = form.elements[name];
    if (control?.setAttribute) control.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  function clearErrors() {
    $$('.field-error').forEach(node => { node.textContent = ''; });
    $$('[aria-invalid]', form).forEach(node => node.removeAttribute('aria-invalid'));
    $('#form-error').hidden = true;
  }
  function resetPhoto(deferRevoke = false) {
    // A departing boat may still be showing the old photo; release it after the glide.
    if (previewURL) { const old = previewURL; if (deferRevoke) setTimeout(() => URL.revokeObjectURL(old), 8000); else URL.revokeObjectURL(old); }
    previewURL = null;
    $('#portrait').value = '';
    $('#upload-preview').hidden = true;
    $('#upload-preview').removeAttribute('src');
    $('#upload-icon').hidden = false;
    $('#remove-photo').hidden = true;
    $('#upload-title').textContent = 'เลือกรูปจากเครื่อง';
    fieldError('portrait', '');
    setPreview();
  }
  function choosePhoto() {
    const file = $('#portrait').files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      resetPhoto();
      fieldError('portrait', 'กรุณาใช้รูป JPG, PNG หรือ WEBP ขนาดไม่เกิน 5 MB');
      return;
    }
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = URL.createObjectURL(file);
    const image = $('#upload-preview');
    image.onload = () => { setPreview(); };
    image.onerror = () => { resetPhoto(); fieldError('portrait', 'ไม่สามารถเปิดรูปภาพนี้ได้ กรุณาเลือกรูปใหม่'); };
    image.src = previewURL;
    image.hidden = false;
    $('#upload-icon').hidden = true;
    $('#remove-photo').hidden = false;
    $('#upload-title').textContent = file.name;
    fieldError('portrait', '');
    setPreview();
  }
  $('#portrait').addEventListener('change', choosePhoto);
  $('#remove-photo').addEventListener('click', () => resetPhoto());
  const upload = $('#upload-area');
  ['dragenter', 'dragover'].forEach(type => upload.addEventListener(type, event => {
    event.preventDefault(); upload.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach(type => upload.addEventListener(type, event => {
    event.preventDefault(); upload.classList.remove('drag-over');
  }));
  upload.addEventListener('drop', event => {
    if (event.dataTransfer.files.length) {
      const transfer = new DataTransfer();
      transfer.items.add(event.dataTransfer.files[0]);
      $('#portrait').files = transfer.files;
      choosePhoto();
    }
  });
  $('#wish').addEventListener('input', () => {
    $('#wish-count').textContent = `${$('#wish').value.length} / 280`;
    fieldError('wish', '');
  });

  function openWish(item, updateURL = true) {
    activeWish = item;
    $('#detail-name').textContent = item.name;
    $('#detail-wish').textContent = item.wish;
    $('#detail-boat').replaceChildren(boat(item.style, item.portrait, item.design, item.appearance));
    window.KhuenLoyShare.detail(item);
    $('#detail-date').textContent = formatter.format(new Date(item.created_at));
    $('#detail-date').dateTime = item.created_at;
    $('#share-wish').textContent = 'คัดลอกลิงก์';
    const partner = item.partner || [...items.values()].find(other => item.pair_id && other.pair_id === item.pair_id && other.id !== item.id);
    $('#detail-partner').hidden = !partner;
    if (partner) $('#detail-partner').replaceChildren(memberCard(partner));
    if (!$('#wish-dialog').open) $('#wish-dialog').showModal();
    if (updateURL) history.replaceState(null, '', `#wish=${item.id}`);
  }

  // ---------- The river: every float rides a lane that drifts left → right forever ----------
  function laneTop(item) {
    // Persisted positions describe the water; remap them below the horizon.
    return isLantern ? 17 + (item.y - 32) / 51 * 51 : 47 + (item.y - 32) / 51 * 37;
  }
  function makeLane(item, launched) {
    const lane = document.createElement('div');
    lane.className = 'drift-lane';
    // Inline essentials so floats never pile up in a corner if together.css is missing (stale cached page).
    lane.style.cssText = 'position:absolute;left:0;width:100%;height:0;pointer-events:none;transform:translateX(var(--x,50%))';
    // A fresh launch glides from the centre preview out toward the far water.
    const top = launched && !isLantern ? 52 + Math.random() * 4 : laneTop(item);
    const depth = isLantern ? 1 : Math.max(0, Math.min(1, (top - 47) / 37));
    const duration = (170 - depth * 75) * (.88 + Math.random() * .24);
    const x = launched ? 50 : item.x;
    lane.style.top = `${top}%`;
    lane.style.zIndex = String(Math.round(top));
    lane.style.setProperty('--x', `${x}%`);
    lane.style.setProperty('--depth-scale', isLantern ? '1' : (.8 + depth * .28).toFixed(3));
    lane.style.setProperty('--drift-duration', `${duration.toFixed(1)}s`);
    lane.style.setProperty('--drift-delay', `${(-x / 100 * duration).toFixed(2)}s`);
    layer.append(lane);
    return lane;
  }
  function addFloat(item, launched = false) {
    if (items.has(item.id)) { Object.assign(items.get(item.id), item); return; }
    items.set(item.id, item);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'floating-krathong';
    button.dataset.id = item.id;
    button.style.setProperty('--duration', `${5 + Math.random() * 4}s`);
    button.style.setProperty('--delay', `${-Math.random() * 8}s`);
    button.setAttribute('aria-label', `อ่านคำอธิษฐานของ ${item.name}`);
    button.append(boat(item.style, item.portrait, item.design, item.appearance));
    const label = document.createElement('span');
    label.className = 'krathong-name'; label.textContent = item.name;
    button.append(label);
    button.addEventListener('click', () => openWish(item));
    if (launched) button.classList.add('highlighted');
    if (item.pair_id) {
      let group = pairGroups.get(item.pair_id);
      if (!group) {
        group = document.createElement('div'); group.className = 'pair-float';
        group.dataset.pairId = item.pair_id;
        group.setAttribute('role','group'); group.setAttribute('aria-label', `ลอย${objectName}เป็นคู่`);
        const badge = document.createElement('span'); badge.className = 'pair-float-badge'; badge.textContent = 'รอคู่'; group.append(badge);
        pairGroups.set(item.pair_id,group); makeLane(item, launched).append(group);
      }
      button.classList.add(`pair-slot-${item.pair_slot}`);
      group.append(button);
      const complete = !!group.querySelector('.pair-slot-1') && !!group.querySelector('.pair-slot-2');
      group.classList.toggle('complete', complete);
      $('.pair-float-badge',group).textContent = complete ? 'ลอยคู่' : 'รอคู่';
      group.classList.toggle('room-pair',item.pair_id === activePair?.id);
    } else makeLane(item, launched).append(button);
  }
  function removeFloat(id) {
    const item = items.get(id);
    const button = $(`[data-id="${id}"]`,layer);
    items.delete(id);
    const group = item?.pair_id && pairGroups.get(item.pair_id);
    if (group) {
      button?.remove();
      if (!group.querySelector('.floating-krathong')) { group.closest('.drift-lane')?.remove(); pairGroups.delete(item.pair_id); }
    } else (button?.closest('.drift-lane') || button)?.remove();
  }

  // The preview boat slowly sails away from the centre and settles into its lane.
  function depart(source, button, delay = 0, snapshot = null) {
    if (!button) return;
    const art = source?.querySelector('.boat-art');
    const lane = button.closest('.drift-lane');
    if (!art || reducedMotion.matches || typeof button.animate !== 'function') return;
    const box = pond.getBoundingClientRect();
    const from = art.getBoundingClientRect();
    lane?.classList.add('arriving');
    button.classList.add('awaiting-arrival');
    const target = (button.querySelector('.boat-art') || button).getBoundingClientRect();
    if (!from.width || !target.width) { lane?.classList.remove('arriving'); button.classList.remove('awaiting-arrival'); return; }
    const ghost = document.createElement('div');
    ghost.className = 'departing-boat';
    ghost.style.cssText = `left:${from.left - box.left}px;top:${from.top - box.top}px;width:${from.width}px;height:${from.height}px`;
    ghost.append(snapshot || art.cloneNode(true));
    pond.append(ghost);
    const dx = (target.left + target.width / 2) - (from.left + from.width / 2);
    const dy = (target.top + target.height / 2) - (from.top + from.height / 2);
    const s = target.width / from.width;
    const at = progress => 1 - (1 - s) * progress;
    const sway = dx < 0 ? -1 : 1;
    const glide = ghost.animate([
      {transform:'translate(0,0) scale(1) rotate(0deg)', offset:0},
      {transform:`translate(${dx * .06}px,${dy * .04 + 8}px) scale(${at(.06)}) rotate(${-2.2 * sway}deg)`, offset:.16},
      {transform:`translate(${dx * .4}px,${dy * .42}px) scale(${at(.48)}) rotate(${2.4 * sway}deg)`, offset:.52},
      {transform:`translate(${dx * .82}px,${dy * .86}px) scale(${at(.88)}) rotate(${-1.2 * sway}deg)`, offset:.82},
      {transform:`translate(${dx}px,${dy}px) scale(${s}) rotate(0deg)`, offset:1},
    ], {duration:5200, delay, easing:'cubic-bezier(.45,.02,.3,1)', fill:'both'});
    const wakeAt = () => { const r = ghost.getBoundingClientRect(); const now = pond.getBoundingClientRect(); ripple(r.left + r.width / 2 - now.left, r.top + r.height * .8 - now.top); };
    setTimeout(wakeAt, delay + 80);
    const wake = setInterval(wakeAt, 950);
    const settle = () => {
      clearInterval(wake);
      button.classList.remove('awaiting-arrival');
      button.classList.add('arrived');
      lane?.classList.remove('arriving');
      wakeAt();
      if (typeof ghost.animate === 'function') ghost.animate([{opacity:1},{opacity:0}], {duration:420, fill:'forwards'}).finished.then(() => ghost.remove(), () => ghost.remove());
      else ghost.remove();
    };
    glide.finished.then(settle, settle);
  }

  function renderCards(records) {
    records = [...records].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const signature = JSON.stringify(records.map(item => [item.id,item.name,item.wish,item.portrait,item.pair_id]));
    if (signature === cardsSignature) return;
    cardsSignature = signature;
    $('#empty-wishes').hidden = records.length > 0;
    $('#wish-marquee').hidden = records.length === 0;
    $('#wishes-pause').hidden = records.length === 0;
    if (!records.length) {$('#wish-grid').replaceChildren();return;}
    function cardFor(item, duplicate) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'wish-card';
      if (duplicate) {card.tabIndex=-1;card.setAttribute('aria-hidden','true');}
      const top = document.createElement('span'); top.className = 'wish-card-top';
      let avatar;
      if (item.portrait) {
        avatar = document.createElement('img'); avatar.src = item.portrait; avatar.alt = ''; avatar.loading = 'lazy';
      } else {
        avatar = document.createElement('span'); avatar.append(boat(item.style, null, item.design, item.appearance));
      }
      avatar.className = 'wish-avatar';
      const name = document.createElement('strong'); name.textContent = item.name;
      top.append(avatar, name);
      if (item.pair_id) {const tag=document.createElement('span');tag.className='wish-pair-tag';tag.textContent='ลอยคู่';top.append(tag);}
      const wish = document.createElement('p'); wish.textContent = item.wish;
      const time = document.createElement('time'); time.dateTime = item.created_at;
      time.textContent = formatter.format(new Date(item.created_at));
      card.append(top, wish, time);
      card.addEventListener('click', () => openWish(item));
      return card;
    }
    const repeats = Math.max(1,Math.ceil(6/records.length));
    const runs = [];
    for (let side=0;side<2;side++) {
      const run=document.createElement('div');run.className='wish-run';
      if(side)run.setAttribute('aria-hidden','true');
      for(let repeat=0;repeat<repeats;repeat++)records.forEach(item=>run.append(cardFor(item,side>0||repeat>0)));
      runs.push(run);
    }
    $('#wish-grid').style.setProperty('--scroll-duration',`${Math.max(42,records.length*repeats*6)}s`);
    $('#wish-grid').replaceChildren(...runs);
  }
  $('#wishes-pause').addEventListener('click',()=>{
    const paused=$('#wishes-pause').getAttribute('aria-pressed')!=='true';
    $('#wishes-pause').setAttribute('aria-pressed',String(paused));
    $('#wishes-pause').textContent=paused?'เลื่อนต่อ':'พักการเลื่อน';
    $('#wish-marquee').classList.toggle('is-paused',paused);
  });
  function updateCount(total) {
    $('#pond-count').textContent = items.size.toLocaleString('th-TH');
    $('#total-count').textContent = total.toLocaleString('th-TH');
  }
  async function refresh() {
    if (refreshing || submitting) return;
    refreshing = true;
    const startedAt = revision;
    try {
      const response = await fetch(endpoint, {cache:'no-store'});
      if (!response.ok) throw new Error('load');
      const data = await response.json();
      if (submitting || revision !== startedAt) return;
      const roomItems = effectiveStage() === 'launched' ? activePair.participants : [];
      const latest = new Set([...data.krathongs,...roomItems].map(item => item.id));
      for (const [id] of items) {
        if (!latest.has(id)) removeFloat(id);
      }
      data.krathongs.forEach(item => addFloat(item));
      window.KhuenLoyShare.restore(data.krathongs);
      roomItems.forEach(item => addFloat(item));
      renderCards(data.krathongs);
      updateCount(data.total);
      $('#pond-notice').hidden = true;
      if (firstLoad) { firstLoad = false; if(sharedWish)openWish(sharedWish,false);else await openSharedWish(); }
    } catch {
      $('#pond-notice').textContent = 'เชื่อมต่อสระไม่ได้ กำลังลองใหม่อัตโนมัติ คุณยังเขียนคำอธิษฐานรอได้';
      $('#pond-notice').hidden = false;
    } finally {
      $('#pond-loading').hidden = true;
      refreshing = false;
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || (activePair && !canJoinPair()) || !form.reportValidity()) return;
    clearErrors();
    if (!$('#wish').value.trim()) { fieldError('wish', `เขียนคำอธิษฐานก่อนลอย${objectName}นะ`); $('#wish').focus(); return; }
    submitting = true;
    const joining = !!activePair;
    const button = $('#float-button'); button.disabled = true;
    $('span', button).textContent = 'กำลังฝากคำอธิษฐาน…';
    try {
      const payload = new FormData(form);
      payload.set('appearance', JSON.stringify(window.KrathongStudio.current()));
      if (payload.get('style').startsWith('custom:')) {
        payload.set('design', payload.get('style').split(':')[1]);
        payload.set('style', 'custom');
      }
      const sent = Date.now();
      const response = await fetch(activePair ? activePair.join_url : endpoint, {method:'POST', body:payload, headers:{'X-CSRFToken':form.elements.csrfmiddlewaretoken.value}});
      const type = response.headers.get('content-type') || '';
      if (!type.includes('application/json')) throw new Error(response.status === 413 ? 'รูปภาพใหญ่เกินไป กรุณาใช้รูปไม่เกิน 5 MB' : 'ส่งข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่');
      const data = await response.json();
      if (!response.ok) {
        if (data.pair) updatePairUI(data.pair);
        if (data.errors) Object.entries(data.errors).forEach(([field, messages]) => fieldError(field, messages.join(' ')));
        throw new Error(data.message || `ลอย${objectName}ไม่สำเร็จ กรุณาลองอีกครั้ง`);
      }
      revision++;
      if (data.pair) {
        // Couples only enter the room now; they float together after both press.
        syncClock(data.pair.server_now, sent, Date.now());
        form.reset(); window.KrathongStudio.reset(); filterDesigns('all'); resetPhoto(true); $('#wish-count').textContent = '0 / 280';
        submitting = false;
        updatePairUI(data.pair);
        if (joining) {
          notify('เข้าห้องแล้ว! กดลอยพร้อมกันได้เลย');
          pond.scrollIntoView({behavior:'smooth', block:'center'});
        } else {
          history.replaceState(null,'',data.pair.invite_url);
          notify('สร้างห้องลอยคู่แล้ว ส่งลิงก์ให้อีกคน แล้วกดลอยพร้อมกันนะ');
          $('#pair-session-panel').scrollIntoView({behavior:'smooth', block:'center'});
        }
      } else {
        // Keep the user's boat, then let the layout settle (receipt card) before measuring the glide.
        const snapshot = $('#preview-boat .boat-art')?.cloneNode(true);
        form.reset(); window.KrathongStudio.reset(); filterDesigns('all'); resetPhoto(true); $('#wish-count').textContent = '0 / 280';
        window.KhuenLoyShare.receipt(data.krathong);
        addFloat(data.krathong, true);
        updateCount(data.total);
        depart($('#preview-boat'), $(`.floating-krathong[data-id="${data.krathong.id}"]`, layer), 0, snapshot);
        soloPreviewDismissed = true;
        renderCards([...items.values()]);
        pond.scrollIntoView({behavior:'smooth', block:'center'});
        celebrate(data.krathong);
        history.replaceState(null, '', `#wish=${data.krathong.id}`);
      }
    } catch (error) {
      $('#form-error').textContent = error instanceof TypeError ? 'การเชื่อมต่อขัดข้อง ข้อมูลยังอยู่ครบ กรุณาลองอีกครั้ง' : error.message;
      $('#form-error').hidden = false;
    } finally {
      submitting = false; button.disabled = false;
      $('span', button).textContent = submitLabel;
      if (activePair) $('#participant-fields').disabled = !canJoinPair();
      updateModeUI();
    }
  });
  // Bring the draft back when starting another wish.
  form.addEventListener('input', () => {
    if (soloPreviewDismissed) soloPreviewDismissed = false;
    renderStage();
  });

  async function openSharedWish() {
    const match = location.hash.match(/^#wish=([a-f0-9-]{36})$/i);
    if (!match) return;
    let item = items.get(match[1]);
    if (!item) {
      try {
        const response = await fetch(`${endpoint}${match[1]}/`);
        if (!response.ok) { notify('ไม่พบคำอธิษฐานนี้'); return; }
        const data = await response.json(); item = data.krathong; item.partner = data.partner;
      } catch { notify('เปิดคำอธิษฐานไม่ได้ กรุณาลองอีกครั้ง'); return; }
    }
    openWish(item, false);
  }
  window.addEventListener('hashchange', openSharedWish);
  $('#help-open').addEventListener('click', () => $('#help-dialog').showModal());
  $('#footer-help').addEventListener('click', () => $('#help-dialog').showModal());
  $$('dialog').forEach(dialog => {
    $$('[data-close]', dialog).forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => { if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }});
  });
  $('#wish-dialog').addEventListener('close', () => {
    if (location.hash.startsWith('#wish=')) history.replaceState(null, '', location.pathname + location.search);
  });
  $('#share-wish').addEventListener('click', async () => {
    if (!activeWish) return;
    const url = `${location.origin}/wish/${activeWish.id}/`;
    try { await navigator.clipboard.writeText(url); $('#share-wish').textContent = 'คัดลอกลิงก์แล้ว'; notify('คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย'); }
    catch {
      const input = document.createElement('input');
      input.value = url; input.readOnly = true; input.setAttribute('aria-label','ลิงก์คำอธิษฐาน กดคัดลอก');
      $('#share-wish').after(input); input.select();
      notify('เลือกและคัดลอกลิงก์ที่แสดงได้เลย');
    }
  });
  $('#fullscreen-toggle').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (pond.requestFullscreen) await pond.requestFullscreen();
      else { pond.classList.toggle('expanded'); $('#fullscreen-toggle').setAttribute('aria-label', pond.classList.contains('expanded') ? 'ย่อสระ' : 'ขยายสระเต็มจอ'); }
    } catch { notify('เบราว์เซอร์นี้ยังไม่รองรับการแสดงเต็มจอ'); }
  });
  document.addEventListener('fullscreenchange', () => {
    $('#fullscreen-toggle').setAttribute('aria-label', document.fullscreenElement ? 'ย่อสระ' : 'ขยายสระเต็มจอ');
  });
  document.addEventListener('keydown', event => { if(event.key === 'Escape') pond.classList.remove('expanded'); });

  // ---------- Fireworks: short, local, no perpetual canvas work between launches ----------
  const canvas = $('#fireworks');
  const context = canvas.getContext('2d');
  let animationFrame = 0;
  let ceremonyTimer;
  let ceremonyItem;
  let fireworksTimer;
  function stopCelebration() {
    clearTimeout(ceremonyTimer); clearTimeout(fireworksTimer);
    cancelAnimationFrame(animationFrame);
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    $('#launch-ceremony').hidden = true;
    pond.classList.remove('celebrating');
  }
  function fireworks(mode = 'solo') {
    if (!context || reducedMotion.matches) return;
    cancelAnimationFrame(animationFrame);
    const bounds = pond.getBoundingClientRect();
    const width = bounds.width, height = bounds.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr; canvas.height = height * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const small = width < 520;
    const palette = [['#ffe1a0','#fff7e0'],['#f7a8c4','#ffe3ee'],['#9ee8d5','#eafff9'],['#c9b6ff','#f2ecff'],['#ffcc66','#fff0c4'],['#ff9e88','#ffe4dc']];
    const rise = 750;
    const plan = [];
    const add = (at, x, y, type, color) => plan.push({at: at + rise, x: width * x, y: height * y, type, colors: palette[color % palette.length], fired:false, wobble: Math.random() * 6});
    if (mode === 'couple') {
      add(0,.5,.19,'heart',1); add(450,.24,.25,'peony',0); add(800,.76,.23,'peony',2);
      add(1400,.38,.15,'ring',3); add(1750,.63,.17,'willow',4); add(2300,.16,.29,'crackle',0);
      add(2650,.84,.27,'heart',5); add(3200,.5,.13,'peony',3); add(3650,.3,.21,'willow',4);
      add(4100,.71,.2,'ring',2); add(4900,.32,.2,'heart',1); add(4900,.68,.2,'heart',1);
      add(5150,.5,.11,'crackle',4); add(5600,.5,.24,'willow',4);
    } else {
      add(0,.5,.18,'peony',0); add(550,.27,.25,'ring',2); add(1000,.73,.22,'peony',1);
      add(1600,.4,.15,'willow',4); add(2100,.62,.19,'crackle',3); add(2700,.2,.28,'peony',5);
      add(3150,.8,.26,'ring',0); add(3900,.35,.18,'peony',1); add(3900,.65,.18,'peony',2); add(4150,.5,.12,'willow',4);
    }
    const particles = [];
    const flashes = [];
    const scale = small ? .7 : 1;
    function explode(burst, time) {
      const [main, accent] = burst.colors;
      const count = small ? 48 : 76;
      const push = (vx, vy, options = {}) => particles.push({
        x:burst.x, y:burst.y, vx, vy, trail:[],
        life:options.life ?? 1.5 + Math.random() * .8, max:options.life ?? 2.3,
        color:options.color || (Math.random() < .28 ? accent : main),
        drag:options.drag ?? .982, gravity:options.gravity ?? 30,
        size:options.size ?? 1.6, trailLength:options.trail ?? 5, twinkle:!!options.twinkle,
      });
      if (burst.type === 'heart') {
        for (let i = 0; i < count; i++) {
          const t = i / count * Math.PI * 2;
          const hx = 16 * Math.sin(t) ** 3;
          const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
          push(hx * 6.4 * scale, hy * 6.4 * scale, {drag:.962, gravity:10, life:2, size:1.9});
        }
        for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, v = Math.random() * 30 * scale; push(Math.cos(a) * v, Math.sin(a) * v, {color:'#fff4e6', twinkle:true, life:1.4}); }
      } else if (burst.type === 'ring') {
        for (let i = 0; i < count; i++) { const a = i / count * Math.PI * 2, v = 96 * scale; push(Math.cos(a) * v, Math.sin(a) * v * .92, {life:1.6, size:1.4}); }
        for (let i = 0; i < count / 2; i++) { const a = i / (count / 2) * Math.PI * 2, v = 48 * scale; push(Math.cos(a) * v, Math.sin(a) * v, {color:accent, life:1.3}); }
      } else if (burst.type === 'willow') {
        for (let i = 0; i < count * .85; i++) { const a = Math.random() * Math.PI * 2, v = (35 + Math.random() * 70) * scale; push(Math.cos(a) * v, Math.sin(a) * v, {color: i % 4 ? '#ffd77a' : '#fff1c9', gravity:44, drag:.972, life:2.8, trail:11, size:1.3}); }
      } else if (burst.type === 'crackle') {
        for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, v = (25 + Math.random() * 105) * scale; push(Math.cos(a) * v, Math.sin(a) * v, {twinkle:true, life:1.2 + Math.random() * .7, size:1.5}); }
      } else {
        for (let i = 0; i < count; i++) { const a = i / count * Math.PI * 2 + Math.random() * .08, v = (38 + Math.random() * 92) * scale; push(Math.cos(a) * v, Math.sin(a) * v); }
        for (let i = 0; i < 22; i++) { const a = Math.random() * Math.PI * 2, v = Math.random() * 40 * scale; push(Math.cos(a) * v, Math.sin(a) * v, {color:accent, life:1.1, size:2}); }
      }
      flashes.push({x:burst.x, y:burst.y, at:time, color:accent});
    }
    const finale = Math.max(...plan.map(burst => burst.at)) + 3200;
    let start = null, last = null;
    function frame(time) {
      if (start === null) { start = time; last = time; }
      const elapsed = time - start;
      const dt = Math.min((time - last) / 1000, .04); last = time;
      context.globalCompositeOperation = 'source-over';
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';
      for (const burst of plan) {
        const progress = (elapsed - (burst.at - rise)) / rise;
        if (!burst.fired && progress > 0 && progress < 1) {
          const eased = 1 - (1 - progress) ** 2;
          const y = height - (height - burst.y) * eased;
          const x = burst.x + Math.sin(progress * 8 + burst.wobble) * 2.4;
          context.globalAlpha = .85;
          const tail = context.createLinearGradient(x, y + 34, x, y);
          tail.addColorStop(0, 'rgba(255,214,150,0)'); tail.addColorStop(1, 'rgba(255,228,170,.95)');
          context.strokeStyle = tail; context.lineWidth = 1.6;
          context.beginPath(); context.moveTo(x, y + 34); context.lineTo(x, y); context.stroke();
          context.fillStyle = '#fff3d6'; context.beginPath(); context.arc(x, y, 1.8, 0, Math.PI * 2); context.fill();
        }
        if (!burst.fired && elapsed >= burst.at) { burst.fired = true; explode(burst, elapsed); }
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const flash = flashes[i], age = (elapsed - flash.at) / 380;
        if (age >= 1) { flashes.splice(i, 1); continue; }
        const radius = 30 + age * 70;
        const glow = context.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius);
        glow.addColorStop(0, flash.color); glow.addColorStop(1, 'rgba(0,0,0,0)');
        context.globalAlpha = (1 - age) * .5; context.fillStyle = glow;
        context.beginPath(); context.arc(flash.x, flash.y, radius, 0, Math.PI * 2); context.fill();
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.trail.push({x:p.x, y:p.y}); if (p.trail.length > p.trailLength) p.trail.shift();
        p.vy += p.gravity * dt; const drag = Math.pow(p.drag, dt * 60); p.vx *= drag; p.vy *= drag;
        p.x += p.vx * dt; p.y += p.vy * dt;
        let alpha = Math.max(0, p.life / p.max);
        if (p.twinkle) alpha *= Math.random() > .45 ? 1 : .15;
        context.globalAlpha = alpha;
        context.strokeStyle = p.color; context.lineWidth = p.size * .75;
        context.beginPath(); context.moveTo(p.trail[0].x, p.trail[0].y); context.lineTo(p.x, p.y); context.stroke();
        context.fillStyle = p.color;
        context.beginPath(); context.arc(p.x, p.y, p.size, 0, Math.PI * 2); context.fill();
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      if (elapsed < finale && !document.hidden) animationFrame = requestAnimationFrame(frame);
      else context.clearRect(0, 0, width, height);
    }
    animationFrame = requestAnimationFrame(frame);
  }
  function ceremonyWish(item) {
    const card = document.createElement('div'); card.className = 'ceremony-wish';
    let avatar;
    if (item.portrait) { avatar = document.createElement('img'); avatar.src = item.portrait; avatar.alt = ''; }
    else { avatar = document.createElement('span'); avatar.append(boat(item.style, null, item.design, item.appearance)); }
    avatar.className = 'ceremony-avatar';
    const name = document.createElement('strong'); name.textContent = item.name;
    const wish = document.createElement('p'); wish.textContent = item.wish;
    const head = document.createElement('span'); head.className = 'ceremony-wish-head'; head.append(avatar, name);
    card.append(head, wish);
    return card;
  }
  function celebrate(item, {couple = null, seed = item.id} = {}) {
    stopCelebration(); ceremonyItem = item;
    const ceremony = $('#launch-ceremony');
    ceremony.classList.toggle('is-couple', !!couple);
    if (hasTogetherUI) $('#ceremony-kicker').textContent = couple ? couple.map(person => person.name).join(' ♡ ') : 'ลอยเรียบร้อยแล้ว';
    $('#ceremony-title').textContent = couple
      ? (isLantern ? 'ปล่อยโคมคู่ขึ้นฟ้าแล้ว' : 'ลอยกระทงคู่เรียบร้อยแล้ว')
      : (isLantern ? 'ปล่อยโคมแล้ว ขอให้สมหวังนะ' : 'กระทงลอยแล้ว ขอให้สมหวังนะ');
    $('#ceremony-wish').hidden = !!couple;
    $('#ceremony-wish').textContent = item.wish;
    if (hasTogetherUI) {
      $('#ceremony-couple').hidden = !couple;
      $('#ceremony-couple').replaceChildren(...(couple || []).map(ceremonyWish));
      $('#ceremony-blessing').textContent = blessing(seed, !!couple);
    }
    ceremony.hidden = false;
    pond.classList.add('celebrating');
    fireworksTimer = setTimeout(() => fireworks(couple ? 'couple' : 'solo'), reducedMotion.matches ? 0 : couple ? 150 : 700);
    ceremonyTimer = setTimeout(stopCelebration, couple ? 26000 : 12000);
    notify(couple ? `ลอย${objectName}คู่แล้ว แตะ${objectName}เพื่ออ่านคำอวยพรของแต่ละคนได้เลย` : `ลอย${objectName}แล้ว แตะที่${objectName}เพื่อดูคำอธิษฐานได้เลย`);
  }
  $('#ceremony-close').addEventListener('click', stopCelebration);
  $('#ceremony-view').addEventListener('click', () => { stopCelebration(); if(ceremonyItem) openWish(ceremonyItem); });

  const music = $('#background-music');
  let audio;
  let masterGain;
  let soundOn = false;
  let audioBusy = false;
  function updateSoundUI() {
    for (const id of ['#sound-toggle','#music-play']) {
      $(id).setAttribute('aria-pressed', String(soundOn));
      $(id).setAttribute('aria-label', soundOn ? 'พักเพลงก่อน' : 'เปิดเพลงหรือเสียงบรรยากาศ');
    }
    $('#music-play-icon').textContent = soundOn ? 'Ⅱ' : '▶';
    $('#equalizer').classList.toggle('playing',soundOn);
  }
  async function toggleAudio() {
    if (audioBusy) return;
    audioBusy = true;
    try {
      if (soundOn) {
        if(music) music.pause(); else if(audio) await audio.suspend();
        soundOn = false;
      } else if (music) {
        music.volume = Number($('#music-volume').value) / 100;
        await music.play(); soundOn = true;
      } else {
        if (!audio) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          audio = new AudioContext();
          masterGain = audio.createGain();
          masterGain.gain.value = .026 * Number($('#music-volume').value) / 100;
          masterGain.connect(audio.destination);
          [130.81,196,261.63].forEach((frequency,index) => {
            const oscillator = audio.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = frequency;
            const gain = audio.createGain(); gain.gain.value = 1/(index+1);
            oscillator.connect(gain); gain.connect(masterGain); oscillator.start();
          });
        }
        await audio.resume(); soundOn = true;
      }
    } catch {
      soundOn = false; notify('เปิดเพลงไม่สำเร็จ ลองจิ้มใหม่อีกทีนะ');
    } finally { updateSoundUI(); audioBusy = false; }
  }
  $('#sound-toggle').addEventListener('click', toggleAudio);
  $('#music-play').addEventListener('click', toggleAudio);
  $('#music-volume').addEventListener('input', () => {
    const volume = Number($('#music-volume').value) / 100;
    if(music) music.volume = volume;
    if(masterGain) masterGain.gain.setTargetAtTime(.026 * volume,audio.currentTime,.1);
  });
  music?.addEventListener('error', () => {
    soundOn = false; updateSoundUI(); notify('เพลงนี้เปิดไม่ได้ ลองแจ้งแอดมินเปลี่ยนไฟล์นะ');
  });
  document.addEventListener('visibilitychange', () => {
    if (soundOn) {
      if (document.hidden) { if(music) music.pause(); else audio?.suspend(); }
      else if (music) music.play().catch(() => {soundOn = false; updateSoundUI();});
      else audio?.resume().catch(() => {soundOn = false; updateSoundUI();});
    }
    if (document.hidden && !$('#launch-ceremony').classList.contains('is-couple')) stopCelebration();
    if (!document.hidden) { refresh(); if (activePair) refreshPair(); }
  });
  setPreview();
  updateModeUI();
  if (activePair) updatePairUI(activePair);
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);
})();
