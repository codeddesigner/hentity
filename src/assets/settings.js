/* Settings shell: side nav (Figma "Settings nav item" 47:121) + save bar behaviour. */
(function () {
  const { icon, qs, qsa } = window.H;
  const items = [['profile', 'Profile', 'user'], ['account', 'Account & security', 'lock'], ['notifications', 'Notifications', 'bell'], ['privacy', 'Privacy & data', 'eye']];
  const el = qs('[data-sidenav]');
  if (el) {
    const cur = el.dataset.sidenav;
    el.outerHTML = `<nav class="side-nav" aria-label="Settings">
      <p class="side-nav__title">Settings</p>
      ${items.map(([k, l, ic]) => `<a href="/settings/${k}"${k === cur ? ' aria-current="page"' : ''}>${icon(ic)}${l.replace('&', '&amp;')}</a>`).join('')}
      <div class="sep"></div>
      <a class="is-danger" href="/settings/delete"${cur === 'delete' ? ' aria-current="page"' : ''}>${icon('trash')}Delete account</a>
    </nav>`;
  }
  // Toggles autosave with a toast where data-autosave is set
  document.addEventListener('change', e => {
    const t = e.target.closest('[data-autosave]');
    if (t) { const key = 'setting.' + t.dataset.autosave; H.store.set(key, t.checked); H.toast(t.dataset.msg || 'Saved'); }
  });
  qsa('[data-autosave]').forEach(t => { const v = H.store.get('setting.' + t.dataset.autosave, null); if (v !== null) t.checked = v; });
})();
