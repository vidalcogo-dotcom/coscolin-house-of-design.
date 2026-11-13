import {t, getLanguage} from './i18n.mjs';
import {products} from './catalog.mjs';
const money=value=>`RM ${value.toFixed(2)}`;
const catalog=document.querySelector('#catalog');
function renderCatalog(){
 catalog.replaceChildren();
 for(const p of products){
 const card=document.createElement('article');card.className='product-card';card.dataset.category=p.category;
 card.innerHTML=`<div class="image-wrapper"><img src="${p.image}" alt="${t(p.name)}" loading="lazy"></div><div class="product-info"><h3 class="product-title">${t(p.name)}</h3><p class="product-desc">${t(p.description)}</p><div class="product-buy"><span class="price">${money(p.price)}</span><button class="add-btn" data-add="${p.id}">${t('Add to bag')}</button></div></div>`;
 catalog.append(card);
}
}
renderCatalog();
for(const button of document.querySelectorAll('.filter-btn'))button.addEventListener('click',()=>{
 document.querySelectorAll('.filter-btn').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 document.querySelectorAll('.product-card').forEach(card=>card.classList.toggle('hidden',button.dataset.filter!=='all'&&button.dataset.filter!==card.dataset.category));
});
let items=[];let busy=false;let vipSending=false;
const vipForm=document.querySelector("#vip-form");
const vipSubmit=document.querySelector("#vip-submit");
const vipStatus=document.querySelector("#vip-status");
const bag=document.querySelector('#bag-dialog');const status=document.querySelector('#bag-status');
function renderBag(data){
 items=data.items;if(!vipSending&&vipStatus.textContent===t('Add a piece to your bag to join the waiting list.')&&items.length)vipStatus.textContent='';vipSubmit.disabled=busy||vipSending||!items.length;document.querySelector('#bag-count').textContent=items.reduce((n,p)=>n+p.quantity,0);document.querySelector('#bag-total').textContent=money(data.total);
 const target=document.querySelector('#bag-items');target.replaceChildren();
 if(!items.length){const empty=document.createElement('p');empty.textContent=t("Your bag is waiting for a little character. Explore the collection to find your piece.");target.append(empty);}
 for(const p of items){const row=document.createElement('div');row.className='bag-row';row.innerHTML=`<img src="${p.image}" alt=""><div><h3>${t(p.name)}</h3><p>${money(p.price)} ${t('each')}</p><div class="quantity"><button data-quantity="${p.id}" data-value="${p.quantity-1}" aria-label="${t('Decrease {name} quantity',{name:t(p.name)})}">−</button><span>${p.quantity}</span><button data-quantity="${p.id}" data-value="${p.quantity+1}" aria-label="${t('Increase {name} quantity',{name:t(p.name)})}" ${p.quantity>=20?'disabled':''}>+</button><button data-quantity="${p.id}" data-value="0" aria-label="${t('Remove {name}',{name:t(p.name)})}">${t('Remove')}</button></div></div>`;target.append(row);}
}
async function loadBag(){const response=await fetch('/api/bag');const data=await response.json();if(!response.ok)throw new Error(data.error);renderBag(data);}
async function changeBag(id,quantity){
 if(busy||vipSending)return;busy=true;vipSubmit.disabled=true;status.textContent=t("Saving your bag…");document.querySelectorAll('[data-add],[data-quantity]').forEach(b=>b.disabled=true);
 try{const response=await fetch('/api/bag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:id,quantity})});const data=await response.json();if(!response.ok)throw new Error(data.error);renderBag(data);status.textContent=t("Your bag is saved.");}
 catch{status.textContent=t("We could not save your bag. Please try again.");}
 finally{busy=false;vipSubmit.disabled=vipSending||!items.length;document.querySelectorAll('[data-add]').forEach(b=>b.disabled=false);document.querySelectorAll('[data-quantity]').forEach(b=>b.disabled=Number(b.dataset.value)>20);}
}
document.addEventListener('click',async event=>{
 const add=event.target.closest('[data-add]');if(add){if(busy)return;bag.showModal();try{await loadBag();await changeBag(add.dataset.add,Math.min(20,(items.find(p=>p.id===add.dataset.add)?.quantity||0)+1));}catch{status.textContent=t("We could not open your bag. Please try again.");}}
 const quantity=event.target.closest('[data-quantity]');if(quantity)await changeBag(quantity.dataset.quantity,Number(quantity.dataset.value));
 const close=event.target.closest('[data-close]');if(close)document.getElementById(close.dataset.close).close();
});
document.querySelector('#open-bag').addEventListener('click',()=>{bag.showModal();loadBag().catch(()=>status.textContent=t("We could not load your bag. Please try again."));});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
loadBag().catch(()=>{});
const chat=document.querySelector('#chat-dialog');document.querySelector('#open-chat').addEventListener('click',()=>chat.showModal());
const messages=document.querySelector('#messages');let history=[];
function appendMessage(text,role){const p=document.createElement('p');p.className=`message ${role}`;p.textContent=text;messages.append(p);messages.scrollTop=messages.scrollHeight;return p;}
document.querySelector('#chat-form').addEventListener('submit',async event=>{
 event.preventDefault();const input=document.querySelector('#chat-input');const text=input.value.trim();if(!text)return;
 const button=event.target.querySelector('button');button.disabled=true;input.disabled=true;appendMessage(text,'user');input.value='';const pending=appendMessage(t("Finding a little inspiration…"),'assistant');
 try{const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:getLanguage()==='zh-Hant'?`請以繁體中文回答。\n${text}`:getLanguage()==='es'?`Responde en español.\n${text}`:text,history})});const data=await response.json();if(!response.ok)throw new Error();pending.textContent=data.reply;history=[...history,{role:'user',text},{role:'model',text:data.reply}].slice(-8);}
 catch{pending.textContent=t("The assistant is unavailable right now. Please try again shortly. You can browse prices and add pieces to your bag above.");}
 finally{button.disabled=false;input.disabled=false;input.focus();messages.scrollTop=messages.scrollHeight;}
});

window.addEventListener('languagechange',()=>{
 renderCatalog();
 const filter=document.querySelector('.filter-btn.active').dataset.filter;
 document.querySelectorAll('.product-card').forEach(card=>card.classList.toggle('hidden',filter!=='all'&&filter!==card.dataset.category));
 renderBag({items,total:items.reduce((sum,p)=>sum+p.price*p.quantity,0)});
 status.textContent='';
});

vipForm.addEventListener('submit',async event=>{
 event.preventDefault();
 if(vipSending||busy)return;
 if(!items.length){vipStatus.textContent=t('Add a piece to your bag to join the waiting list.');return;}
 if(!vipForm.reportValidity())return;
 vipSending=true;vipSubmit.disabled=true;
 const snapshot=items.map(p=>`${p.name} [${p.id}] × ${p.quantity} — ${money(p.price)} each — ${money(p.price*p.quantity)}`).join('\n');
 vipForm.elements.selection.value=snapshot;
 vipForm.elements.subtotal.value=money(items.reduce((sum,p)=>sum+p.price*p.quantity,0));
 vipForm.elements.language.value=getLanguage();
 const body=new URLSearchParams(new FormData(vipForm)).toString();
 vipStatus.textContent=t('Sending your request…');
 try{
  const response=await fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!response.ok)throw new Error('Submission failed');
  vipForm.reset();
  vipStatus.textContent=t('You’re on the VIP waiting list. Vidal will contact you by email about your selection. No payment has been taken.');
 }catch{
  vipStatus.textContent=t('Your request could not be sent. Please try again, or email vidalcogo@gmail.com.');
 }finally{vipSending=false;vipSubmit.disabled=busy||!items.length;}
});
