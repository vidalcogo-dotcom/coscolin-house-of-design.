import {products} from '../catalog.mjs';

const app = document.body;
const screenButtons = [...document.querySelectorAll('[data-screen]')];

function showScreen(screen) {
  app.dataset.screen = screen;
  for (const button of document.querySelectorAll('.app-nav button')) {
    const active = button.dataset.screen === screen;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  }
  window.scrollTo({top: 0, behavior: 'smooth'});
}

for (const button of screenButtons) {
  button.addEventListener('click', () => showScreen(button.dataset.screen));
}

document.querySelector('[data-open-catalog]').addEventListener('click', () => showScreen('catalog'));
for (const button of document.querySelectorAll('[data-quick-filter]')) {
  button.addEventListener('click', () => {
    document.querySelector(`[data-filter="${button.dataset.quickFilter}"]`).click();
    showScreen('catalog');
  });
}
document.querySelector('#featured-price').textContent = `RM ${products.find(product => product.id === 'terra').price.toFixed(2)}`;
for (const button of document.querySelectorAll('#app-bag, #app-concierge')) {
  button.addEventListener('click', () => {
    for (const tab of document.querySelectorAll('.app-nav button')) {
      tab.classList.toggle('active', tab === button);
      tab.setAttribute('aria-current', tab === button ? 'page' : 'false');
    }
  });
}
window.addEventListener('hashchange', () => {
  if (location.hash === '#catalog') showScreen('catalog');
});
