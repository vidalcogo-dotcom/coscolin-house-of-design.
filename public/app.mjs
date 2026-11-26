// Keep the existing saved bag and concierge as the single source of truth.
document.querySelector('#app-bag').addEventListener('click',()=>document.querySelector('#open-bag').click());
document.querySelector('#app-concierge').addEventListener('click',()=>document.querySelector('#open-chat').click());
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
