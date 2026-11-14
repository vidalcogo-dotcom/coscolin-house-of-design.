// Keep the existing saved bag and concierge as the single source of truth.
document.querySelector('#app-bag').addEventListener('click',()=>document.querySelector('#open-bag').click());
document.querySelector('#app-concierge').addEventListener('click',()=>document.querySelector('#open-chat').click());
const downloadDialog=document.querySelector('#download-dialog');
for(const button of document.querySelectorAll('[data-download-app]')){
 button.addEventListener('click',()=>downloadDialog.showModal());
}
let installPrompt;
const installButton=document.querySelector('#install-app');
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();installPrompt=event;installButton.hidden=false;
});
installButton.addEventListener('click',async()=>{
 if(!installPrompt)return;
 try{
  await installPrompt.prompt();
  const {outcome}=await installPrompt.userChoice;
  document.querySelector('#install-status').textContent=outcome==='accepted'?'Installation requested. Follow your phone’s prompts.':'You can install later using the Chrome menu above.';
 }catch{
  document.querySelector('#install-status').textContent='Please use the Chrome menu instructions above to install Coscolin.';
 }finally{
  installPrompt=null;installButton.hidden=true;
 }
});
window.addEventListener('appinstalled',()=>{installPrompt=null;installButton.hidden=true;});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
