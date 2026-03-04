// faq.js - Accordion de perguntas frequentes

const initAccordion = (root) => {
  const triggers = Array.from(root.querySelectorAll('.faq-trigger'));
  if (!triggers.length) return;

  const closeItem = (item) => {
    const trigger = item.querySelector('.faq-trigger');
    const panel = item.querySelector('.faq-panel');
    const icon = item.querySelector('.faq-icon');
    if (!trigger || !panel) return;

    item.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    panel.style.maxHeight = '0px';
    if (icon) icon.textContent = '+';
  };

  const openItem = (item) => {
    const trigger = item.querySelector('.faq-trigger');
    const panel = item.querySelector('.faq-panel');
    const icon = item.querySelector('.faq-icon');
    if (!trigger || !panel) return;

    item.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    panel.style.maxHeight = `${panel.scrollHeight}px`;
    if (icon) icon.textContent = 'x';
  };

  const closeAllExcept = (keepItem) => {
    triggers.forEach((t) => {
      const item = t.closest('.faq-item');
      if (!item || item === keepItem) return;
      closeItem(item);
    });
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.faq-item');
      if (!item) return;

      const isOpen = item.classList.contains('is-open');
      if (isOpen) {
        closeItem(item);
        return;
      }

      closeAllExcept(item);
      openItem(item);
    });
  });

  // Mantém altura correta ao redimensionar (se houver item aberto)
  window.addEventListener('resize', () => {
    const open = root.querySelector('.faq-item.is-open .faq-panel');
    if (!open) return;
    open.style.maxHeight = `${open.scrollHeight}px`;
  });
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.faq-accordion').forEach((root) => initAccordion(root));
});
