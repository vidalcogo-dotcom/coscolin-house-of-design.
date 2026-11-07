import {products} from './catalog.mjs';
const money=value=>`RM ${value.toFixed(2)}`;
const catalog=document.querySelector('#catalog');
for(const p of products){
 const card=document.createElement('article');card.className='product-card';card.dataset.category=p.category;
 card.innerHTML=`<div class="image-wrapper"><img src="${p.image}" alt="${p.name}" loading="lazy"></div><div class="product-info"><h3 class="product-title">${p.name}</h3><p class="product-desc">${p.description}</p><div class="product-buy"><span class="price">${money(p.price)}</span><button class="add-btn" data-add="${p.id}">Add to bag</button></div></div>`;
 catalog.append(card);
}
for(const button of document.querySelectorAll('.filter-btn'))button.addEventListener('click',()=>{
 document.querySelectorAll('.filter-btn').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 document.querySelectorAll('.product-card').forEach(card=>card.classList.toggle('hidden',button.dataset.filter!=='all'&&button.dataset.filter!==card.dataset.category));
});
let items=[];let busy=false;
const bag=document.querySelector('#bag-dialog');const status=document.querySelector('#bag-status');
function renderBag(data){
 items=data.items;document.querySelector('#bag-count').textContent=items.reduce((n,p)=>n+p.quantity,0);document.querySelector('#bag-total').textContent=money(data.total);
 const target=document.querySelector('#bag-items');target.replaceChildren();
 if(!items.length){const empty=document.createElement('p');empty.textContent='Your bag is waiting for a little character. Explore the collection to find your piece.';target.append(empty);}
 for(const p of items){const row=document.createElement('div');row.className='bag-row';row.innerHTML=`<img src="${p.image}" alt=""><div><h3>${p.name}</h3><p>${money(p.price)} each</p><div class="quantity"><button data-quantity="${p.id}" data-value="${p.quantity-1}" aria-label="Decrease ${p.name} quantity">−</button><span>${p.quantity}</span><button data-quantity="${p.id}" data-value="${p.quantity+1}" aria-label="Increase ${p.name} quantity" ${p.quantity>=20?'disabled':''}>+</button><button data-quantity="${p.id}" data-value="0" aria-label="Remove ${p.name}">Remove</button></div></div>`;target.append(row);}
}
async function loadBag(){const response=await fetch('/api/bag');const data=await response.json();if(!response.ok)throw new Error(data.error);renderBag(data);}
async function changeBag(id,quantity){
 if(busy)return;busy=true;status.textContent='Saving your bag…';document.querySelectorAll('[data-add],[data-quantity]').forEach(b=>b.disabled=true);
 try{const response=await fetch('/api/bag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:id,quantity})});const data=await response.json();if(!response.ok)throw new Error(data.error);renderBag(data);status.textContent='Your bag is saved.';}
 catch{status.textContent='We could not save your bag. Please try again.';}
 finally{busy=false;document.querySelectorAll('[data-add]').forEach(b=>b.disabled=false);document.querySelectorAll('[data-quantity]').forEach(b=>b.disabled=Number(b.dataset.value)>20);}
}
document.addEventListener('click',async event=>{
 const add=event.target.closest('[data-add]');if(add){if(busy)return;bag.showModal();try{await loadBag();await changeBag(add.dataset.add,Math.min(20,(items.find(p=>p.id===add.dataset.add)?.quantity||0)+1));}catch{status.textContent='We could not open your bag. Please try again.';}}
 const quantity=event.target.closest('[data-quantity]');if(quantity)await changeBag(quantity.dataset.quantity,Number(quantity.dataset.value));
 const close=event.target.closest('[data-close]');if(close)document.getElementById(close.dataset.close).close();
});
document.querySelector('#open-bag').addEventListener('click',()=>{bag.showModal();loadBag().catch(()=>status.textContent='We could not load your bag. Please try again.');});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
loadBag().catch(()=>{});
const chat=document.querySelector('#chat-dialog');document.querySelector('#open-chat').addEventListener('click',()=>chat.showModal());
const messages=document.querySelector('#messages');let history=[];
function appendMessage(text,role){const p=document.createElement('p');p.className=`message ${role}`;p.textContent=text;messages.append(p);messages.scrollTop=messages.scrollHeight;return p;}
document.querySelector('#chat-form').addEventListener('submit',async event=>{
 event.preventDefault();const input=document.querySelector('#chat-input');const text=input.value.trim();if(!text)return;
 const button=event.target.querySelector('button');button.disabled=true;input.disabled=true;appendMessage(text,'user');input.value='';const pending=appendMessage('Finding a little inspiration…','assistant');
 try{const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,history})});const data=await response.json();if(!response.ok)throw new Error();pending.textContent=data.reply;history=[...history,{role:'user',text},{role:'model',text:data.reply}].slice(-8);}
 catch{pending.textContent='The assistant is unavailable right now. Please try again shortly. You can browse prices and add pieces to your bag above.';}
 finally{button.disabled=false;input.disabled=false;input.focus();messages.scrollTop=messages.scrollHeight;}
});
