'use strict';
(() => {
  const dialog = document.getElementById('mattiw-welcome');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const key = 'khuenloy.mattiw-welcome.v1';
  const cookieName = 'mattiw_welcome_seen';
  function hasVisited() {
    try { if (localStorage.getItem(key) === 'seen') return true; } catch { /* Cookie fallback. */ }
    return document.cookie.split(';').some(part => part.trim() === `${cookieName}=1`);
  }
  function rememberVisit() {
    try { localStorage.setItem(key, 'seen'); }
    catch {
      document.cookie = `${cookieName}=1; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    }
  }
  function openWelcome() {
    if (!dialog.open) dialog.showModal();
  }
  dialog.querySelectorAll('[data-welcome-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });
  dialog.addEventListener('close', rememberVisit);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  document.getElementById('about-mattiw')?.addEventListener('click', openWelcome);
  function firstVisit() {
    // Shared wishes open directly; the welcome can appear on the next normal visit.
    if (hasVisited() || location.pathname.startsWith('/couple/') || location.pathname.startsWith('/wish/') || location.hash.startsWith('#wish=') || document.querySelector('dialog[open]')) return;
    openWelcome();
  }
  if (document.readyState === 'complete') firstVisit();
  else window.addEventListener('load', firstVisit, {once:true});
})();
