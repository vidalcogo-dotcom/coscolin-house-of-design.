import {t, getLanguage, translatePage} from './i18n.mjs';
import {shop} from './shop-config.mjs';
import {products} from './catalog.mjs';
const money=value=>`RM ${value.toFixed(2)}`;
const catalog=document.querySelector('#catalog');
let availability={};
const buyLabel=id=>availability[id]?t('Add to bag'):t('Pre-order');
function renderCatalog(){
 catalog.replaceChildren();
 for(const p of products){
 const card=document.createElement('article');card.className='product-card';card.dataset.category=p.category;
 card.innerHTML=`<button type="button" class="image-wrapper product-open" data-detail="${p.id}" aria-label="${t('View {name}',{name:t(p.name)})}"><img src="${p.image}" alt="${t(p.name)}" loading="lazy"></button><div class="product-info"><h3 class="product-title"><button type="button" class="product-title-btn" data-detail="${p.id}">${t(p.name)}</button></h3><p class="product-desc">${t(p.description)}</p><div class="product-buy"><span class="price">${money(p.price)}</span><button class="add-btn" data-add="${p.id}">${buyLabel(p.id)}</button></div></div>`;
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
 items=data.items;if(data.availability){availability=data.availability;updateBuyButtons();}if(!vipSending&&vipStatus.textContent===t('Add a piece to your bag to join the waiting list.')&&items.length)vipStatus.textContent='';vipSubmit.disabled=busy||vipSending||!items.length;const count=items.reduce((n,p)=>n+p.quantity,0);document.querySelector('#bag-count').textContent=count;const appCount=document.querySelector('#app-bag-count');if(appCount){appCount.textContent=count;appCount.hidden=count===0;}document.querySelector('#bag-total').textContent=money(data.total);
 const target=document.querySelector('#bag-items');target.replaceChildren();
 if(!items.length){const empty=document.createElement('p');empty.textContent=t("Your bag is waiting for a little character. Explore the collection to find your piece.");target.append(empty);}
 for(const p of items){const row=document.createElement('div');row.className='bag-row';row.innerHTML=`<img src="${p.image}" alt=""><div><h3>${t(p.name)}</h3><p>${money(p.price)} ${t('each')}</p>${readyNote(p)}<div class="quantity"><button data-quantity="${p.id}" data-value="${p.quantity-1}" aria-label="${t('Decrease {name} quantity',{name:t(p.name)})}">−</button><span>${p.quantity}</span><button data-quantity="${p.id}" data-value="${p.quantity+1}" aria-label="${t('Increase {name} quantity',{name:t(p.name)})}" ${p.quantity>=20?'disabled':''}>+</button><button data-quantity="${p.id}" data-value="0" aria-label="${t('Remove {name}',{name:t(p.name)})}">${t('Remove')}</button></div></div>`;target.append(row);}
}
async function loadBag(){const response=await fetch('/api/bag');const data=await response.json();if(!response.ok)throw new Error(data.error);renderBag(data);}
async function changeBag(id,quantity){
 if(busy||vipSending)return;busy=true;vipSubmit.disabled=true;status.textContent=t("Saving your bag…");document.querySelectorAll('[data-add],[data-quantity]').forEach(b=>b.disabled=true);
 try{const response=await fetch('/api/bag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:id,quantity})});const data=await response.json();if(!response.ok)throw new Error(data.error);renderBag(data);status.textContent=t("Your bag is saved.");}
 catch{status.textContent=t("We could not save your bag. Please try again.");}
 finally{busy=false;vipSubmit.disabled=vipSending||!items.length;renderCheckout();document.querySelectorAll('[data-add]').forEach(b=>b.disabled=false);document.querySelectorAll('[data-quantity]').forEach(b=>b.disabled=Number(b.dataset.value)>20);}
}
document.addEventListener('click',async event=>{
 const detail=event.target.closest('[data-detail]');if(detail){openProduct(detail.dataset.detail);return;}
 const add=event.target.closest('[data-add]');if(add){document.querySelector('#product-dialog')?.close();if(busy)return;bag.showModal();try{await loadBag();await changeBag(add.dataset.add,Math.min(20,(items.find(p=>p.id===add.dataset.add)?.quantity||0)+1));}catch{status.textContent=t("We could not open your bag. Please try again.");}}
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
 if(productDialog.open)openProduct(productDialog.dataset.product);
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

// ---- Ready-to-ship vs pre-order ----
function updateBuyButtons(){document.querySelectorAll('[data-add]').forEach(b=>{b.textContent=buyLabel(b.dataset.add);});}
function readyNote(p){
 const ready=Math.min(p.ready??0,p.quantity),pre=p.quantity-ready;
 if(!pre)return `<p class="stock-note ready">${t('Ready to ship')}</p>`;
 const text=ready?t('{ready} ready to ship · {pre} pre-order',{ready,pre}):t('Pre-order');
 return `<p class="stock-note preorder">${text} – ${t('made for you, ships in about {weeks} weeks',{weeks:shop.preorderWeeks})}</p>`;
}

// ---- Enlarged product view ----
document.body.insertAdjacentHTML('beforeend',`<dialog id="product-dialog" aria-labelledby="product-dialog-title"><button class="product-dialog-close" data-close="product-dialog" aria-label="Close product">&times;</button><div id="product-detail" data-i18n-skip></div></dialog>`);
const productDialog=document.querySelector('#product-dialog');
function openProduct(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 productDialog.dataset.product=id;
 const inStock=availability[id];
 document.querySelector('#product-detail').innerHTML=`<figure class="product-detail-image"><img src="${p.image}" alt="${t(p.name)}"></figure><div class="product-detail-copy"><p class="campaign-kicker eyebrow">${t({bags:'Bags & Totes',charms:'Bag Charms',jewelry:'Jewelry'}[p.category])}</p><h2 id="product-dialog-title">${t(p.name)}</h2><p class="product-detail-price">${money(p.price)}</p><p class="product-detail-desc">${t(p.description)}</p><p class="stock-note ${inStock?'ready':'preorder'}">${inStock?t('In stock – ready to ship'):t('Pre-order – made for you, ships in about {weeks} weeks',{weeks:shop.preorderWeeks})}</p><button class="add-btn primary-button" data-add="${p.id}">${buyLabel(p.id)}</button><p class="small-note">${t('Pay by DuitNow QR, Touch ’n Go, bank transfer or Wise.')}</p></div>`;
 if(!productDialog.open)productDialog.showModal();
}

// ---- Checkout ----
const ordersKey='coscolin-orders';
const savedOrders=()=>{try{return JSON.parse(localStorage.getItem(ordersKey)||'[]').filter(o=>o&&typeof o.token==='string'&&typeof o.number==='string').slice(0,5);}catch{return [];}};
const vipSection=document.querySelector('.vip-waitlist');
document.querySelector('.bag-total').insertAdjacentHTML('afterend',`<section class="checkout" id="checkout" aria-labelledby="checkout-title">
 <h2 id="checkout-title">Checkout</h2>
 <p class="small-note">Place your order, then pay within 24 hours by DuitNow QR, Touch ’n Go, bank transfer or Wise. Your order page shows all payment details.</p>
 <form id="checkout-form" novalidate>
  <label for="co-name">Full name</label><input id="co-name" name="name" autocomplete="name" maxlength="120" required>
  <label for="co-email">Email address</label><input id="co-email" name="email" type="email" autocomplete="email" maxlength="254" required>
  <label for="co-phone">WhatsApp number</label><input id="co-phone" name="phone" type="tel" autocomplete="tel" maxlength="25" placeholder="+60 12 345 6789" required>
  <fieldset class="delivery-options"><legend>Delivery</legend>
   <label class="delivery-choice"><input type="radio" name="deliveryMethod" value="malaysia" checked><span><strong>Malaysia – Lalamove or Grab delivery</strong><small>Delivery fee depends on distance. Vidal confirms it by WhatsApp.</small></span></label>
   <label class="delivery-choice"><input type="radio" name="deliveryMethod" value="overseas"><span><strong>Overseas shipping</strong><small>International shipping from RM 20. Exact quote by WhatsApp.</small></span></label>
  </fieldset>
  <label for="co-address">Delivery address (including postcode and country)</label><textarea id="co-address" name="address" rows="3" autocomplete="street-address" maxlength="1000" required></textarea>
  <label for="co-notes">Notes (optional)</label><textarea id="co-notes" name="notes" rows="2" maxlength="2000"></textarea>
  <div class="checkout-summary"><span>Pay now (items)</span><strong id="checkout-total">RM 0.00</strong></div>
  <p class="small-note">The delivery fee is paid separately once Vidal confirms it.</p>
  <label class="vip-consent"><input type="checkbox" name="agree" required><span>I will pay within 24 hours. Unpaid orders are cancelled automatically. Pre-order pieces ship when ready.</span></label>
  <button class="add-btn primary-button" id="checkout-submit" type="submit" disabled>Place order</button>
  <p class="small-note" id="checkout-status" role="status" aria-live="polite" data-i18n-skip></p>
 </form>
</section><div id="recent-orders" data-i18n-skip></div>`);
if(vipSection){const details=document.createElement('details');details.className='vip-details';details.innerHTML='<summary>Not ready to buy? Join the VIP waiting list</summary>';vipSection.replaceWith(details);details.append(vipSection);}
translatePage();
const checkoutForm=document.querySelector('#checkout-form'),checkoutSubmit=document.querySelector('#checkout-submit'),checkoutStatus=document.querySelector('#checkout-status');
let placing=false;
function renderCheckout(){
 const total=items.reduce((sum,p)=>sum+p.price*p.quantity,0);
 document.querySelector('#checkout').hidden=!items.length;
 document.querySelector('#checkout-total').textContent=money(total);
 checkoutSubmit.disabled=placing||busy||!items.length;
 const recent=savedOrders(),box=document.querySelector('#recent-orders');box.replaceChildren();
 if(recent.length){const p=document.createElement('p');p.className='small-note';p.textContent=t('Your recent orders:')+' ';for(const o of recent){const a=document.createElement('a');a.href=`/order?o=${encodeURIComponent(o.token)}`;a.textContent=o.number;p.append(a,' ');}box.append(p);}
}
// Re-render the checkout whenever the bag changes.
new MutationObserver(renderCheckout).observe(document.querySelector('#bag-items'),{childList:true,subtree:true});
window.addEventListener('languagechange',renderCheckout);
renderCheckout();
checkoutForm.addEventListener('submit',async event=>{
 event.preventDefault();
 if(placing||busy||!items.length)return;
 if(!checkoutForm.reportValidity())return;
 const data=Object.fromEntries(new FormData(checkoutForm));
 placing=true;checkoutSubmit.disabled=true;checkoutStatus.textContent=t('Placing your order…');
 try{
  const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,agree:!!data.agree,language:getLanguage()})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'');
  try{localStorage.setItem(ordersKey,JSON.stringify([{number:result.number,token:result.token},...savedOrders()].slice(0,5)));}catch{}
  checkoutStatus.textContent=t('Order {number} placed. Opening your payment page…',{number:result.number});
  location.href=`/order?o=${encodeURIComponent(result.token)}`;
 }catch(error){checkoutStatus.textContent=error.message?t(error.message):t('Your order could not be placed. Please try again.');placing=false;renderCheckout();}
});
