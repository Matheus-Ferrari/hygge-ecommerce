(function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
  try {
    var c = JSON.parse(localStorage.getItem('hygge_assets_v1') || 'null');
    if (!c) return;
    var m = window.innerWidth <= 768, p = location.pathname;
    var u = (p === '/' || p.indexOf('/produto') === 0 || p.indexOf('/todos') === 0)
      ? (m ? c.bannerHomeMobile || c.bannerHome : c.bannerHome || c.bannerHomeMobile)
      : p.indexOf('/contato') === 0
      ? (m ? c.bannerContatoMobile || c.bannerContato : c.bannerContato || c.bannerContatoMobile)
      : (p.indexOf('/login') === 0 || p.indexOf('/cadastro') === 0)
      ? (m ? c.bannerLoginMobile || c.bannerLogin : c.bannerLogin || c.bannerLoginMobile)
      : p.indexOf('/sobre') === 0
      ? (m ? c.bannerSobreHyggeMobile || c.bannerSobreHygge : c.bannerSobreHygge || c.bannerSobreHyggeMobile)
      : null;
    if (u && u.indexOf('http') === 0) {
      var l = document.createElement('link');
      l.rel = 'preload'; l.as = 'image'; l.href = u;
      document.head.appendChild(l);
    }
  } catch (e) {}
})();
