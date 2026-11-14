// Keep the existing saved bag and concierge as the single source of truth.
document.querySelector('#app-bag').addEventListener('click',()=>document.querySelector('#open-bag').click());
document.querySelector('#app-concierge').addEventListener('click',()=>document.querySelector('#open-chat').click());
let installPrompt;
const installButton=document.querySelector('#install-app');
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();installPrompt=event;installButton.hidden=false;
});
installButton.addEventListener('click',async()=>{
 if(!installPrompt)return;
 await installPrompt.prompt();installPrompt=null;installButton.hidden=true;
});
window.addEventListener('appinstalled',()=>{installPrompt=null;installButton.hidden=true;});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
