// Menu Hambúrguer Global
(function() {
  // Carrega o HTML do menu e insere no topo do body
  function loadMenu() {
    fetch('src/components/menu.html')
      .then(res => res.text())
      .then(html => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        while (temp.firstChild) {
          document.body.insertBefore(temp.firstChild, document.body.firstChild);
        }
        initMenu();
      });
  }

  function initMenu() {
    // Usa o botão hambúrguer já existente na página
    const hamburger = document.querySelector('.menu-btn');
    const sidebar = document.querySelector('.menu-sidebar');
    const overlay = document.querySelector('.menu-overlay');
    const closeBtn = document.querySelector('.menu-close');
    const links = document.querySelectorAll('.menu-list a');

    function openMenu() {
      sidebar.classList.add('active');
      overlay.classList.add('active');
      document.body.classList.add('menu-open');
    }
    function closeMenu() {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      document.body.classList.remove('menu-open');
    }

    hamburger.addEventListener('click', openMenu);
    // Garante que o botão X funcione mesmo se for renderizado depois
    if (closeBtn) {
      closeBtn.onclick = closeMenu;
    }
    overlay.addEventListener('click', closeMenu);
    links.forEach(link => {
      link.addEventListener('click', function(e) {
        // Fecha o menu e permite navegação
        closeMenu();
      });
    });

    // Fecha com ESC
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && sidebar.classList.contains('active')) {
        closeMenu();
      }
    });
  }

  // Carrega CSS dinamicamente
  function loadCSS() {
    if (!document.querySelector('link[href*="src/css/menu.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'src/css/menu.css';
      document.head.appendChild(link);
    }
  }

  // Inicialização automática
  document.addEventListener('DOMContentLoaded', function() {
    loadCSS();
    loadMenu();
  });
  // Header scroll effect
  function handleHeaderScroll() {
    const header = document.querySelector('.header');
    if (!header) return;
    if (window.scrollY > 80) {
      header.classList.add('header--scrolled');
    } else {
      header.classList.remove('header--scrolled');
    }
  }
  window.addEventListener('scroll', handleHeaderScroll);
  document.addEventListener('DOMContentLoaded', handleHeaderScroll);

})();
