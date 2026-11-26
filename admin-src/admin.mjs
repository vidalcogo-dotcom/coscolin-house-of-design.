// Coscolin admin: bundled into /admin/admin.js at build time (see netlify.toml).
import { login, logout, getUser, handleAuthCallback, acceptInvite, requestPasswordRecovery, updateUser, AuthError } from '@netlify/identity';

const root = document.querySelector('#admin-root');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = sen => `RM ${(sen / 100).toFixed(2)}`;
const when = iso => iso ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '';
const STATUS = { awaiting_payment: 'Awaiting payment', proof_uploaded: 'Proof uploaded – check it', paid: 'Paid', shipped: 'Shipped', cancelled: 'Cancelled' };
const FILTERS = [['open', 'To do'], ['proof_uploaded', 'Proof uploaded'], ['awaiting_payment', 'Awaiting payment'], ['paid', 'Paid'], ['shipped', 'Shipped'], ['cancelled', 'Cancelled'], ['all', 'All'], ['stock', 'Stock']];
let filter = 'open';
let message = '';

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (response.status === 401) { showLogin('Your session has expired. Please log in again.'); throw new Error('Please log in.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function showLogin(note = '') {
  document.querySelector('#admin-user').hidden = true;
  root.innerHTML = `<section class="order-card admin-login"><p class="eyebrow">Coscolin admin</p><h1>Log in</h1>
    <form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="primary" type="submit">Log in</button></form>
    <p><button type="button" class="copy-btn" id="forgot">Forgot password?</button></p>
    <p class="admin-msg" role="status">${esc(note)}</p></section>`;
}

function showSetPassword(title, onSubmit) {
  root.innerHTML = `<section class="order-card admin-login"><p class="eyebrow">Coscolin admin</p><h1>${esc(title)}</h1>
    <form id="password-form"><label>New password (at least 8 characters)<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
    <button class="primary" type="submit">Save password</button></form><p class="admin-msg" role="status"></p></section>`;
  root.querySelector('#password-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await onSubmit(e.target.elements.password.value); await start(); }
    catch (error) { root.querySelector('.admin-msg').textContent = error instanceof AuthError ? error.message : 'Could not save the password.'; }
  });
}

const waNumber = phone => { let d = phone.replace(/\D/g, ''); if (d.startsWith('0')) d = `6${d}`; return d; };
const orderLink = o => `${location.origin}/order?o=${o.accessToken}`;
function waLink(o, text) { return `https://wa.me/${waNumber(o.phone)}?text=${encodeURIComponent(text)}`; }

function orderCard(o) {
  const needsAction = o.status === 'proof_uploaded' || (o.status === 'paid' && (o.deliveryFeeSen === null || !o.deliveryPaid));
  const items = o.items.map(i => {
    const pre = i.quantity - i.readyQuantity;
    return `<li>${esc(i.name)} × ${i.quantity} — ${money(i.unitPriceSen * i.quantity)}<br><small class="stock-note ${pre ? 'preorder' : 'ready'}">${pre ? `${i.readyQuantity} from stock · ${pre} PRE-ORDER` : 'From stock'}</small></li>`;
  }).join('');
  const fee = o.deliveryFeeSen === null ? 'Not set yet' : `${money(o.deliveryFeeSen)} · ${o.deliveryPaid ? 'paid' : 'unpaid'}`;
  const proofs = o.proofs.length ? o.proofs.map((p, n) => `<button type="button" class="btn" data-proof="${p.id}">View proof ${n + 1}</button>`).join(' ') : '<span class="small-note">No proof uploaded yet</span>';
  const feeText = o.deliveryFeeSen ? `Hi ${o.customerName}, this is Vidal from Coscolin. The delivery fee for order ${o.number} is ${money(o.deliveryFeeSen)}. Please pay with reference ${o.number} and upload the screenshot here: ${orderLink(o)}` : `Hi ${o.customerName}, this is Vidal from Coscolin about your order ${o.number}: ${orderLink(o)}`;
  const canPay = ['awaiting_payment', 'proof_uploaded', 'cancelled'].includes(o.status);
  return `<article class="admin-order ${needsAction ? 'needs-action' : ''}" data-id="${o.id}">
    <header><h2>${esc(o.number)} · ${esc(o.customerName)}</h2><p class="status-pill status-${o.status}">${esc(STATUS[o.status])}</p></header>
    <p class="small-note">Placed ${when(o.createdAt)}${o.status === 'awaiting_payment' ? ` · pay by ${when(o.expiresAt)}` : ''}${o.paidAt ? ` · paid ${when(o.paidAt)}` : ''}${o.shippedAt ? ` · shipped ${when(o.shippedAt)}` : ''}${o.cancelledAt ? ` · cancelled ${when(o.cancelledAt)}` : ''} · language ${esc(o.language)}</p>
    <div class="admin-cols">
      <div><h3>Customer</h3><p>${esc(o.customerName)}</p><p><a href="mailto:${esc(o.email)}?subject=${encodeURIComponent(`Your Coscolin order ${o.number}`)}">${esc(o.email)}</a></p><p>${esc(o.phone)}</p>
        <h3>Delivery – ${o.deliveryMethod === 'overseas' ? 'Overseas' : 'Malaysia (Lalamove/Grab)'}</h3><p>${esc(o.address)}</p>${o.notes ? `<h3>Customer notes</h3><p>${esc(o.notes)}</p>` : ''}</div>
      <div><h3>Items</h3><ul class="admin-items">${items}</ul>
        <dl class="order-totals"><div><dt>Items</dt><dd>${money(o.subtotalSen)}${['paid', 'shipped'].includes(o.status) ? ' · paid' : ''}</dd></div><div><dt>Delivery</dt><dd>${fee}</dd></div><div class="due"><dt>Still to pay</dt><dd>${money(o.dueSen)}</dd></div></dl>
        <h3>Payment proof</h3><div class="action-row">${proofs}</div></div>
    </div>
    <div class="admin-actions">
      <div class="action-row">${canPay ? `<button class="btn primary-btn" data-action="mark_paid">${o.status === 'cancelled' ? 'Late payment: mark items paid' : 'Mark items paid'}</button>` : ''}
        <a class="btn wa" href="${waLink(o, feeText)}" target="_blank" rel="noopener">WhatsApp customer</a>
        <button class="btn" data-copy="${esc(orderLink(o))}">Copy customer link</button>
        ${['awaiting_payment', 'proof_uploaded', 'paid'].includes(o.status) ? '<button class="btn danger" data-action="cancel">Cancel order</button>' : ''}</div>
      ${o.status !== 'cancelled' ? `<div class="action-row"><label class="small-note" for="fee-${o.id}">Delivery fee (RM)</label><input type="number" id="fee-${o.id}" min="0" max="5000" step="0.01" inputmode="decimal" value="${o.deliveryFeeSen === null ? '' : (o.deliveryFeeSen / 100).toFixed(2)}" placeholder="${o.deliveryMethod === 'overseas' ? 'from 20.00' : 'e.g. 12.00'}"><button class="btn" data-action="set_delivery_fee">Save fee</button>${o.deliveryFeeSen && !o.deliveryPaid ? '<button class="btn primary-btn" data-action="mark_delivery_paid">Mark delivery paid</button>' : ''}</div>` : ''}
      ${['paid', 'shipped'].includes(o.status) ? `<div class="action-row"><label class="small-note" for="track-${o.id}">Courier / tracking</label><input type="text" id="track-${o.id}" maxlength="300" value="${esc(o.trackingInfo)}" placeholder="e.g. Lalamove, driver Ali 012…"><button class="btn primary-btn" data-action="mark_shipped">${o.status === 'shipped' ? 'Update tracking' : 'Mark shipped'}</button></div>` : ''}
      <div class="action-row"><label class="small-note" for="note-${o.id}">Private note</label><input type="text" id="note-${o.id}" maxlength="2000" value="${esc(o.adminNote)}"><button class="btn" data-action="note">Save note</button></div>
    </div></article>`;
}

async function renderOrders() {
  root.innerHTML = `${tabs()}<p class="admin-msg" role="status">${esc(message)}</p><p>Loading orders…</p>`;
  try {
    const { orders } = await api(`/api/admin/orders?status=${filter}`);
    root.innerHTML = `${tabs()}<p class="admin-msg" role="status">${esc(message)}</p>${orders.length ? orders.map(orderCard).join('') : '<p class="notice">No orders here.</p>'}`;
  } catch (error) { root.innerHTML = `${tabs()}<p class="notice">${esc(error.message)}</p>`; }
}

async function renderStock() {
  root.innerHTML = `${tabs()}<p>Loading stock…</p>`;
  try {
    const { stock } = await api('/api/admin/stock');
    root.innerHTML = `${tabs()}<section class="order-card"><h2>Stock ready to ship</h2><p class="small-note">When a product reaches 0, the shop shows “Pre-order” instead of “Add to bag”. It never shows sold out. Stock is reserved when an order is placed and returned if it is cancelled.</p>
      <form id="stock-form"><table class="stock-table"><thead><tr><th></th><th>Product</th><th>Price</th><th>In stock</th></tr></thead><tbody>
      ${stock.map(p => `<tr><td><img src="${esc(p.image)}" alt=""></td><td>${esc(p.name)}</td><td>RM ${p.price}</td><td><input type="number" min="0" step="1" name="${esc(p.id)}" value="${p.stock}" aria-label="Stock for ${esc(p.name)}"></td></tr>`).join('')}
      </tbody></table><p><button class="primary" type="submit" style="padding:0 1.5rem">Save stock</button></p><p class="admin-msg" role="status">${esc(message)}</p></form></section>`;
  } catch (error) { root.innerHTML = `${tabs()}<p class="notice">${esc(error.message)}</p>`; }
}

const tabs = () => `<p class="eyebrow">Coscolin admin</p><h1>${filter === 'stock' ? 'Stock' : 'Orders'}</h1><nav class="admin-tabs">${FILTERS.map(([id, label]) => `<button type="button" data-filter="${id}" aria-pressed="${id === filter}">${label}</button>`).join('')}</nav>`;
const render = () => (filter === 'stock' ? renderStock() : renderOrders());

root.addEventListener('click', async event => {
  const tab = event.target.closest('[data-filter]');
  if (tab) { filter = tab.dataset.filter; message = ''; return render(); }
  if (event.target.id === 'forgot') {
    const email = root.querySelector('[name=email]')?.value;
    if (!email) { root.querySelector('.admin-msg').textContent = 'Enter your email first.'; return; }
    try { await requestPasswordRecovery(email); root.querySelector('.admin-msg').textContent = 'Check your email for a reset link.'; }
    catch (error) { root.querySelector('.admin-msg').textContent = error.message; }
    return;
  }
  const copy = event.target.closest('[data-copy]');
  if (copy) { try { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = 'Copied'; } catch { prompt('Customer link', copy.dataset.copy); } return; }
  const proof = event.target.closest('[data-proof]');
  if (proof) {
    const win = window.open('', '_blank');
    try {
      const response = await fetch(`/api/admin/proofs/${proof.dataset.proof}`);
      if (!response.ok) throw new Error('Could not open the file.');
      const url = URL.createObjectURL(await response.blob());
      if (win) win.location.href = url; else location.href = url;
    } catch (error) { win?.close(); alert(error.message); }
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const card = button.closest('[data-id]'), id = card.dataset.id, action = button.dataset.action;
  if (action === 'cancel' && !confirm('Cancel this order? Reserved stock goes back to the shop.')) return;
  if (action === 'mark_paid' && !confirm('Have you checked your bank, TNG or Wise app and found this payment?')) return;
  const body = { action };
  if (action === 'set_delivery_fee') body.fee = card.querySelector(`#fee-${id}`).value;
  if (action === 'mark_shipped') body.tracking = card.querySelector(`#track-${id}`).value;
  if (action === 'note') body.note = card.querySelector(`#note-${id}`).value;
  button.disabled = true;
  try {
    const updated = await api(`/api/admin/orders/${id}`, { method: 'POST', body: JSON.stringify(body) });
    message = `${updated.number} updated.`;
    card.outerHTML = orderCard(updated);
    root.querySelector('.admin-msg').textContent = message;
  } catch (error) { button.disabled = false; root.querySelector('.admin-msg').textContent = error.message; window.scrollTo({ top: 0, behavior: 'smooth' }); }
});

root.addEventListener('submit', async event => {
  if (event.target.id === 'login-form') {
    event.preventDefault();
    const { email, password } = event.target.elements;
    try { await login(email.value, password.value); await start(); }
    catch (error) { root.querySelector('.admin-msg').textContent = error instanceof AuthError && error.status === 401 ? 'Wrong email or password.' : (error.message || 'Login failed.'); }
  }
  if (event.target.id === 'stock-form') {
    event.preventDefault();
    const stock = Object.fromEntries([...new FormData(event.target)].map(([k, v]) => [k, Number(v)]));
    try { await api('/api/admin/stock', { method: 'POST', body: JSON.stringify({ stock }) }); message = 'Stock saved.'; }
    catch (error) { message = error.message; }
    await renderStock();
  }
});

document.querySelector('#logout').addEventListener('click', async () => { await logout().catch(() => {}); showLogin('You are logged out.'); });

async function start() {
  const user = await getUser();
  if (!user) return showLogin();
  const response = await fetch('/api/admin/me');
  if (response.status === 403) {
    document.querySelector('#admin-user').hidden = false; document.querySelector('#admin-email').textContent = user.email;
    root.innerHTML = '<section class="notice"><h1>No admin access yet</h1><p>In the Netlify dashboard, open Identity, click your user and add the role <strong>admin</strong>. Then log out and log in again.</p></section>';
    return;
  }
  if (!response.ok) return showLogin('Please log in again.');
  document.querySelector('#admin-user').hidden = false;
  document.querySelector('#admin-email').textContent = user.email;
  await render();
}

(async () => {
  try {
    const result = await handleAuthCallback();
    if (result?.type === 'invite') return showSetPassword('Welcome – choose your password', password => acceptInvite(result.token, password));
    if (result?.type === 'recovery') return showSetPassword('Choose a new password', password => updateUser({ password }));
  } catch (error) { return showLogin(error.message || 'This link has expired.'); }
  await start();
})();
