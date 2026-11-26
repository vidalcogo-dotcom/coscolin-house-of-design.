import {t, getLanguage} from './i18n.mjs';
import {shop} from './shop-config.mjs';

const root = document.querySelector('#order-root');
const token = new URLSearchParams(location.search).get('o') || '';
const money = sen => `RM ${(sen / 100).toFixed(2)}`;
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
root.innerHTML = `<p class="order-loading">${t('Loading your order…')}</p>`;
let order = null;
let activeTab = 'duitnow';
let uploadMessage = '';
let uploading = false;

function timeLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return t('the deadline has passed');
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return t('{h} h {m} min', {h, m});
}
const deadline = iso => new Intl.DateTimeFormat(getLanguage() === 'zh-Hant' ? 'zh-Hant' : getLanguage(), {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(iso));

const STATUS = {
  awaiting_payment: 'Awaiting payment',
  proof_uploaded: 'Payment proof received',
  paid: 'Paid – being prepared',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};
const STEPS = ['awaiting_payment', 'proof_uploaded', 'paid', 'shipped'];

function copyButton(value, label) {
  return `<button type="button" class="copy-btn" data-copy="${esc(value)}" aria-label="${esc(t('Copy {label}', {label}))}">${t('Copy')}</button>`;
}

function statusMessage(o) {
  const due = money(o.dueSen);
  const feeLine = o.deliveryFeeSen === null
    ? `<p>${o.deliveryMethod === 'overseas' ? t('Vidal will send your international shipping quote (from RM 20) by WhatsApp.') : t('Vidal will confirm your Lalamove or Grab delivery fee by WhatsApp.')}</p>`
    : '';
  switch (o.status) {
    case 'awaiting_payment':
      return `<div class="notice notice-action"><h2>${t('Please pay {amount}', {amount: due})}</h2><p>${t('Pay within 24 hours, by {deadline}. Time left: {left}.', {deadline: esc(deadline(o.expiresAt)), left: `<strong data-countdown>${timeLeft(o.expiresAt)}</strong>`})}</p><p>${t('Use {number} as the payment reference, then upload your screenshot below.', {number: `<strong>${esc(o.number)}</strong>`})}</p>${feeLine}</div>`;
    case 'proof_uploaded':
      return `<div class="notice"><h2>${t('Thank you – we are checking your payment')}</h2><p>${t('Vidal will confirm your payment by email or WhatsApp, usually within one day.')}</p>${feeLine}</div>`;
    case 'paid':
      if (o.dueSen > 0) return `<div class="notice notice-action"><h2>${t('Please pay the delivery fee of {amount}', {amount: due})}</h2><p>${t('Your items are paid. Use {number} as the reference and upload your screenshot below.', {number: `<strong>${esc(o.number)}</strong>`})}</p></div>`;
      return `<div class="notice"><h2>${t('Paid – your order is being prepared')}</h2><p>${t('Thank you! Pre-order pieces ship when they are ready.')}</p>${feeLine}</div>`;
    case 'shipped':
      return `<div class="notice"><h2>${t('Your order is on its way')}</h2>${o.trackingInfo ? `<p>${t('Delivery details:')} <strong>${esc(o.trackingInfo)}</strong></p>` : ''}</div>`;
    default:
      return `<div class="notice notice-muted"><h2>${t('This order was cancelled')}</h2><p>${t('Payment was not received within 24 hours. If you already paid, email {email} with your order number and we will sort it out.', {email: `<a href="mailto:${shop.contactEmail}?subject=${encodeURIComponent(o.number)}">${shop.contactEmail}</a>`})}</p></div>`;
  }
}

function progress(o) {
  if (o.status === 'cancelled') return '';
  const current = STEPS.indexOf(o.status);
  const labels = ['Order placed', 'Payment sent', 'Paid', 'Shipped'];
  return `<ol class="order-steps">${labels.map((label, i) => `<li class="${i <= current ? 'done' : ''}${i === current ? ' current' : ''}">${t(label)}</li>`).join('')}</ol>`;
}

function itemsList(o) {
  const rows = o.items.map(i => {
    const pre = i.quantity - i.readyQuantity;
    const note = pre ? (i.readyQuantity ? t('{ready} ready to ship · {pre} pre-order', {ready: i.readyQuantity, pre}) : t('Pre-order')) + ` – ${t('made for you, ships in about {weeks} weeks', {weeks: shop.preorderWeeks})}` : t('Ready to ship');
    return `<li class="order-item"><img src="${esc(i.image)}" alt=""><div><h3>${esc(t(i.name))}</h3><p>${i.quantity} × ${money(i.unitPriceSen)}</p><p class="stock-note ${pre ? 'preorder' : 'ready'}">${note}</p></div><strong>${money(i.unitPriceSen * i.quantity)}</strong></li>`;
  }).join('');
  const fee = o.deliveryFeeSen === null ? t('To be confirmed') : `${money(o.deliveryFeeSen)}${o.deliveryFeeSen > 0 ? ` · ${o.deliveryPaid ? t('paid') : t('unpaid')}` : ''}`;
  const method = o.deliveryMethod === 'overseas' ? t('Overseas shipping') : t('Malaysia – Lalamove or Grab delivery');
  return `<section class="order-card"><h2>${t('Your pieces')}</h2><ul class="order-items">${rows}</ul><dl class="order-totals"><div><dt>${t('Items')}</dt><dd>${money(o.subtotalSen)}</dd></div><div><dt>${t('Delivery')} <small>${method}</small></dt><dd>${fee}</dd></div>${o.status === 'cancelled' ? '' : `<div class="due"><dt>${t('Amount to pay now')}</dt><dd>${money(o.dueSen)}</dd></div>`}</dl></section>`;
}

function paymentPanel(o) {
  if (o.status === 'cancelled' || o.dueSen <= 0) return '';
  const amount = (o.dueSen / 100).toFixed(2);
  const tabs = [['duitnow', 'DuitNow QR'], ['tng', 'Touch ’n Go'], ['bank', 'Bank transfer'], ['wise', 'Wise']];
  const qr = (src, name) => `<figure class="qr"><img src="${src}" alt="${esc(t('{name} QR code for {payee}', {name, payee: shop.qrName}))}" width="320"><figcaption><a href="${src}" download>${t('Save QR image')}</a></figcaption></figure>`;
  const row = (label, value, copy = true) => `<div class="pay-row"><dt>${label}</dt><dd><span>${esc(value)}</span>${copy ? copyButton(value, label) : ''}</dd></div>`;
  const panels = {
    duitnow: `${qr(shop.qr.duitnow, 'DuitNow')}<p>${t('Scan with any Malaysian banking app or e-wallet: Maybank, CIMB, Public Bank, RHB, Touch ’n Go, GrabPay, Boost, ShopeePay and more.')}</p><p class="small-note">${t('On your phone? Save the QR image, then choose it from your photos in your banking app.')}</p>`,
    tng: `${qr(shop.qr.tng, 'Touch ’n Go')}<p>${t('Open Touch ’n Go eWallet, tap Scan, and scan this code or choose the saved image from your photos.')}</p>`,
    bank: `<dl class="pay-details">${row(t('Bank'), shop.bank.name, false)}${row(t('Account type'), t(shop.bank.accountType), false)}${row(t('Account name'), shop.payeeName)}${row(t('Account number'), shop.bank.accountNumber)}</dl><p class="small-note">${t('Instant transfer (DuitNow / IBG) from any Malaysian bank.')}</p>`,
    wise: `${qr(shop.qr.wise, 'Wise')}<p>${t('Wise users: scan the Wisetag to pay instantly in the Wise app.')}</p><dl class="pay-details">${row(t('Bank'), shop.wise.bankName, false)}${row(t('Account name'), shop.payeeName)}${row(t('Account number'), shop.wise.accountNumber)}</dl><p class="small-note">${t('From a Malaysian bank: choose “Wise” as the bank and use the account number above.')}</p>`,
  };
  return `<section class="order-card payment" aria-labelledby="pay-title"><h2 id="pay-title">${t('How to pay')}</h2>
    <dl class="pay-key">${row(t('Amount'), `RM ${amount}`)}${row(t('Reference'), o.number)}</dl>
    <p class="small-note">${t('You will see the name {name} when you pay.', {name: `<strong>${shop.qrName}</strong>`})}</p>
    <div class="pay-tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${id === activeTab}" tabindex="${id === activeTab ? 0 : -1}" data-tab="${id}">${t(label)}</button>`).join('')}</div>
    ${tabs.map(([id]) => `<div class="pay-panel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" ${id === activeTab ? '' : 'hidden'}>${panels[id]}</div>`).join('')}
  </section>`;
}

function uploadPanel(o) {
  if (o.status === 'cancelled' || o.status === 'shipped' || (o.dueSen <= 0 && o.status !== 'proof_uploaded')) return '';
  return `<section class="order-card" aria-labelledby="proof-title"><h2 id="proof-title">${t('Upload your payment proof')}</h2>
    <p>${t('After paying, upload a screenshot or PDF of your receipt so Vidal can confirm it quickly.')}</p>
    <form id="proof-form"><label for="proof-file">${t('Screenshot or PDF (max 5 MB)')}</label><input id="proof-file" name="proof" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" required>
    <button class="primary" type="submit" ${uploading ? 'disabled' : ''}>${uploading ? t('Uploading…') : t('Upload payment proof')}</button></form>
    <p class="small-note" role="status">${uploadMessage ? esc(uploadMessage) : o.proofCount ? t('Uploads received: {count}', {count: o.proofCount}) : ''}</p></section>`;
}

function render() {
  if (!order) return;
  const o = order;
  document.title = `${o.number} · Coscolin`;
  root.innerHTML = `<p class="eyebrow">${t('Your order')}</p><h1>${t('Order {number}', {number: esc(o.number)})}</h1>
    <p class="status-pill status-${o.status}">${t(STATUS[o.status] || o.status)}</p>
    ${progress(o)}${statusMessage(o)}
    <div class="order-grid"><div>${paymentPanel(o)}${uploadPanel(o)}</div><div>${itemsList(o)}
    <section class="order-card help"><h2>${t('Keep this page')}</h2><p>${t('This private link is how you check your order. Bookmark it or copy it now.')}</p><button type="button" class="copy-btn wide" data-copy="${esc(location.href)}">${t('Copy order link')}</button><p class="small-note">${t('Questions? Email {email}.', {email: `<a href="mailto:${shop.contactEmail}?subject=${encodeURIComponent(o.number)}">${shop.contactEmail}</a>`})}</p></section></div></div>`;
}

async function load() {
  if (!/^[\w-]{20,64}$/.test(token)) { root.innerHTML = `<h1>${t('We could not find this order.')}</h1><p><a href="/">${t('Back to the shop')}</a></p>`; return; }
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '');
    const changed = JSON.stringify(data) !== JSON.stringify(order);
    order = data;
    if (changed && !document.querySelector('#proof-file')?.files.length) render();
  } catch (error) {
    if (!order) root.innerHTML = `<h1>${esc(error.message ? t(error.message) : t('Your order could not be loaded. Please try again.'))}</h1><p><a href="/">${t('Back to the shop')}</a></p>`;
  }
}

root.addEventListener('click', async event => {
  const tab = event.target.closest('[data-tab]');
  if (tab) { activeTab = tab.dataset.tab; render(); document.querySelector(`#tab-${activeTab}`)?.focus(); return; }
  const copy = event.target.closest('[data-copy]');
  if (copy) {
    try { await navigator.clipboard.writeText(copy.dataset.copy); const old = copy.textContent; copy.textContent = t('Copied'); setTimeout(() => { copy.textContent = old; }, 1500); }
    catch { window.prompt(t('Copy'), copy.dataset.copy); }
  }
});
root.addEventListener('keydown', event => {
  const tab = event.target.closest('[data-tab]');
  if (!tab || !['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
  const ids = [...root.querySelectorAll('[data-tab]')].map(b => b.dataset.tab);
  activeTab = ids[(ids.indexOf(activeTab) + (event.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
  render(); document.querySelector(`#tab-${activeTab}`)?.focus();
});
root.addEventListener('submit', async event => {
  if (event.target.id !== 'proof-form') return;
  event.preventDefault();
  const file = event.target.elements.proof.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { uploadMessage = t('Please upload a file smaller than 5 MB.'); render(); return; }
  uploading = true; uploadMessage = ''; render();
  try {
    const body = new FormData(); body.append('proof', file);
    const response = await fetch(`/api/orders/${encodeURIComponent(token)}/proof`, {method: 'POST', body});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '');
    order = data; uploadMessage = t('Thank you! Your payment proof was uploaded.');
  } catch (error) {
    uploadMessage = error.message ? t(error.message) : t('The upload failed. Please try again.');
  } finally { uploading = false; render(); }
});

window.addEventListener('languagechange', render);
setInterval(() => { const el = document.querySelector('[data-countdown]'); if (el && order) el.textContent = timeLeft(order.expiresAt); }, 30000);
setInterval(() => { if (document.visibilityState === 'visible' && !uploading) load(); }, 120000);
load();
