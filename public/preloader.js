(function () {
  var MIN_MS   = 1600;  // tempo mínimo visível (ms)
  var FADE_MS  = 700;   // duração do fade-out (ms)
  var MAX_MS   = 8000;  // fallback máximo (ms)

  // ── Esconde o HTML imediatamente (síncrono, ainda no <head>) ──────────────
  // Isso elimina o flash de conteúdo antes do overlay aparecer.
  var docEl = document.documentElement;
  docEl.style.background = '#003028';
  docEl.style.visibility = 'hidden';

  var style = document.createElement('style');
  style.textContent = [
    '#hygge-pl{',
      'position:fixed;inset:0;',
      'background:#003028;',
      'display:flex;align-items:center;justify-content:center;',
      'z-index:999999;',
      'opacity:1;',
      'transition:opacity ' + (FADE_MS / 1000) + 's ease;',
    '}',
    '#hygge-pl.out{opacity:0;pointer-events:none;}',
    '#hygge-pl img{',
      'width:clamp(160px,22vw,280px);',
      'animation:hyggePulse 1.8s ease-in-out infinite;',
    '}',
    '@keyframes hyggePulse{',
      '0%,100%{opacity:1;}',
      '50%{opacity:0.15;}',
    '}'
  ].join('');
  document.head.appendChild(style);

  var el = document.createElement('div');
  el.id = 'hygge-pl';
  el.innerHTML = '<img src="/img/logo.png" alt="Hygge Games">';

  var dismissed   = false;
  var readyToHide = false;  // assets aplicados
  var minExpired  = false;  // tempo mínimo decorrido

  function tryHide() {
    if (dismissed || !readyToHide || !minExpired) return;
    dismissed = true;
    el.classList.add('out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, FADE_MS + 50);
  }

  // Timer mínimo — garante que o preloader fica visível ao menos MIN_MS
  setTimeout(function () { minExpired = true; tryHide(); }, MIN_MS);

  // Chamado pelo script.js após aplicar os assets
  window.__hyggeHidePreloader = function () {
    readyToHide = true;
    tryHide();
  };

  // Fallback absoluto
  setTimeout(function () {
    if (!dismissed) { dismissed = true; el.classList.add('out'); }
    docEl.style.visibility = '';
  }, MAX_MS);

  function inject() {
    var body = document.body || document.documentElement;
    body.insertBefore(el, body.firstChild);
    // Revela o HTML assim que o overlay está no DOM — sem flash
    if (typeof window.__plShow === 'function') window.__plShow();
    docEl.style.visibility = '';
  }
  if (document.body) { inject(); }
  else { document.addEventListener('DOMContentLoaded', inject); }
})();
