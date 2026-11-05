/* Settings shell: side nav (Figma "Settings nav item" 47:121) + toggles that save to profiles.settings. */
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
  // [data-autosave="key"] checkboxes are stored in profiles.settings[key]
  async function init() {
    await API.ready;
    if (!API.uid) { location.replace('/signin?next=' + encodeURIComponent(location.pathname)); return; }
    const st = (API.profile && API.profile.settings) || {};
    qsa('[data-autosave]').forEach(t => { if (t.dataset.autosave in st) t.checked = !!st[t.dataset.autosave]; });
  }
  document.addEventListener('change', async e => {
    const t = e.target.closest('[data-autosave]'); if (!t) return;
    const st = Object.assign({}, API.profile.settings || {}, { [t.dataset.autosave]: t.checked });
    try { await API.updateProfile({ settings: st }); H.toast(t.dataset.msg || 'Saved'); } catch (err) { t.checked = !t.checked; H.fail(err); }
  });
  window.SettingsReady = init();
})();
