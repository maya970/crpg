/**
 * 顶部导航点击后显示过渡层再跳转，避免「点了没反应」的感觉。
 */
(function () {
  function ensureOverlay() {
    let o = document.getElementById('rpg-nav-overlay');
    if (!o) {
      o = document.createElement('div');
      o.id = 'rpg-nav-overlay';
      o.className = 'rpg-nav-overlay';
      o.setAttribute('aria-live', 'polite');
      o.innerHTML = '<div class="rpg-nav-overlay-card">正在打开页面…</div>';
      document.body.appendChild(o);
    }
    return o;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.town-nav a[href]').forEach((a) => {
      a.addEventListener('click', function (ev) {
        const href = this.getAttribute('href');
        if (!href || href.charAt(0) === '#') return;
        if (this.getAttribute('aria-current') === 'page') return;
        ev.preventDefault();
        const o = ensureOverlay();
        o.classList.add('on');
        window.setTimeout(() => {
          window.location.href = href;
        }, 240);
      });
    });
  });
})();
