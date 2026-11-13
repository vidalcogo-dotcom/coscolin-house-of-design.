const scene = document.querySelector('#opening-scene');
const toggle = document.querySelector('#motion-toggle');
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');

function setPaused(paused) {
  scene.classList.toggle('motion-paused', paused);
  toggle.setAttribute('aria-pressed', String(paused));
  toggle.textContent = paused ? 'Play motion' : 'Pause motion';
}

function followPreference() {
  setPaused(preference.matches);
  // The reduced-motion stylesheet always keeps the opening still.
  toggle.hidden = preference.matches;
}

if (scene && toggle) {
  followPreference();
  preference.addEventListener('change', followPreference);
  toggle.addEventListener('click', () => {
    setPaused(!scene.classList.contains('motion-paused'));
  });
}
