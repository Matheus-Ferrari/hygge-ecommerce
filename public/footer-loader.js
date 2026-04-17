(function () {
  var el = document.getElementById('footer-container');
  if (!el) return;
  fetch('/components/footer.html')
    .then(function (r) { return r.text(); })
    .then(function (html) { el.innerHTML = html; });
})();
