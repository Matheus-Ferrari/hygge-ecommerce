// Menu Hambúrguer Global
import '../css/menu.css';
import { loadAppAssets } from './script.js';

(function() {
  // Carrega o HTML do menu e insere no topo do body
  function loadMenu() {
    fetch('/components/menu.html')
      .then(res => res.text())
      .then(html => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        while (temp.firstChild) {
          document.body.insertBefore(temp.firstChild, document.body.firstChild);
        }
        initMenu();
        // Chama depois da injeção do HTML para garantir que .logo-img do menu existe no DOM
        loadAppAssets();
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

  // Inicialização automática
  document.addEventListener('DOMContentLoaded', function() {
    loadMenu(); // loadAppAssets é chamado dentro de loadMenu após injeção do HTML
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
