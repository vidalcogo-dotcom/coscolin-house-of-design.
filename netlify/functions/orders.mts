import { randomUUID } from 'node:crypto';
import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { cartItems, orderItems, orders, paymentProofs, productStock } from '../../db/schema.js';
import { products } from '../../public/catalog.mjs';
import { shop } from '../../public/shop-config.mjs';
import { BAG_COOKIE, cancelOrder, describeOrder, loadOrder, money, newToken, notify, orderNumber, sameOrigin } from '../../lib/shop.js';

const headers = { 'Cache-Control': 'no-store' };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });
const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max + 1) : '';

async function createOrder(req: Request) {
 if (!sameOrigin(req)) return fail('Forbidden', 403);
 const raw = await req.text();
 if (raw.length > 10000) return fail('Your order details are too long.', 413);
 let body: Record<string, unknown>;
 try { body = JSON.parse(raw); } catch { return fail('Please send valid order details.'); }
 if (!body || typeof body !== 'object') return fail('Please send valid order details.');
 const name = text(body.name, 120), email = text(body.email, 254), phone = text(body.phone, 30);
 const address = text(body.address, 1000), notes = text(body.notes, 2000);
 const deliveryMethod = body.deliveryMethod, language = ['en', 'es', 'zh-Hant'].includes(body.language as string) ? body.language as string : 'es';
 if (!name || name.length > 120) return fail('Please enter your name.');
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail('Please enter a valid email address.');
 if (!/^\+?[\d\s()-]{6,25}$/.test(phone)) return fail('Please enter a valid WhatsApp number.');
 if (address.length < 5 || address.length > 1000) return fail('Please enter your delivery address.');
 if (notes.length > 2000) return fail('Your notes are too long.');
 if (deliveryMethod !== 'malaysia' && deliveryMethod !== 'overseas') return fail('Please choose a delivery option.');
 if (body.agree !== true) return fail('Please accept the payment and delivery terms.');

 const sessionId = req.headers.get('cookie')?.match(BAG_COOKIE)?.[1];
 if (!sessionId) return fail('Your bag is empty.');
 const bag = (await db.select().from(cartItems).where(eq(cartItems.sessionId, sessionId)))
  .flatMap(row => { const product = products.find(p => p.id === row.productId); return product && row.quantity > 0 ? [{ product, quantity: Math.min(row.quantity, 20) }] : []; });
 if (!bag.length) return fail('Your bag is empty.');

 const accessToken = newToken();
 const expiresAt = new Date(Date.now() + shop.paymentWindowHours * 3600_000);
 const subtotalSen = bag.reduce((sum, i) => sum + Math.round(i.product.price * 100) * i.quantity, 0);

 const created = await db.transaction(async tx => {
  const ids = bag.map(i => i.product.id);
  const locked = await tx.select().from(productStock).where(inArray(productStock.productId, ids)).for('update');
  const [order] = await tx.insert(orders).values({ accessToken, customerName: name, email, phone, address, deliveryMethod, notes, language, subtotalSen, expiresAt }).returning();
  const lines = [];
  for (const { product, quantity } of bag) {
   const available = Math.max(0, locked.find(r => r.productId === product.id)?.stock ?? 0);
   const readyQuantity = Math.min(available, quantity);
   if (readyQuantity > 0) await tx.update(productStock).set({ stock: sql`${productStock.stock} - ${readyQuantity}`, updatedAt: new Date() }).where(eq(productStock.productId, product.id));
   lines.push({ orderId: order.id, productId: product.id, name: product.name, unitPriceSen: Math.round(product.price * 100), quantity, readyQuantity });
  }
  await tx.insert(orderItems).values(lines);
  await tx.delete(cartItems).where(eq(cartItems.sessionId, sessionId));
  return { order, lines };
 });

 const number = orderNumber(created.order.id);
 const link = new URL(`/order?o=${accessToken}`, req.url).toString();
 await notify(req, 'new-order', {
  subject: `New Coscolin order ${number} – ${money(subtotalSen)}`,
  order: number, name, email, phone, address,
  delivery: deliveryMethod === 'malaysia' ? 'Malaysia (Lalamove/Grab – quote needed)' : 'Overseas (quote needed, from RM 20)',
  items: created.lines.map(l => `${l.name} × ${l.quantity} — ${money(l.unitPriceSen * l.quantity)}${l.readyQuantity < l.quantity ? ` (${l.readyQuantity} ready, ${l.quantity - l.readyQuantity} PRE-ORDER)` : ' (ready to ship)'}`).join('\n'),
  subtotal: money(subtotalSen), notes, language,
  deadline: expiresAt.toISOString(),
  link: new URL('/admin/', req.url).toString(),
 });
 return Response.json({ number, token: accessToken, link }, { status: 201, headers });
}

async function getOrder(token: string) {
 let found = await loadOrder(eq(orders.accessToken, token));
 if (!found) return fail('We could not find this order.', 404);
 if (found.order.status === 'awaiting_payment' && found.order.expiresAt.getTime() < Date.now()) {
  await cancelOrder(found.order.id, ['awaiting_payment']);
  found = await loadOrder(eq(orders.accessToken, token));
 }
 return Response.json(describeOrder(found!), { headers });
}

async function uploadProof(req: Request, token: string) {
 if (!sameOrigin(req)) return fail('Forbidden', 403);
 if (Number(req.headers.get('content-length') || 0) > MAX_PROOF_BYTES + 100_000) return fail('Please upload a file smaller than 5 MB.', 413);
 const [order] = await db.select().from(orders).where(eq(orders.accessToken, token)).limit(1);
 if (!order) return fail('We could not find this order.', 404);
 if (order.status === 'cancelled') return fail('This order was cancelled. Please contact us if you already paid.', 409);
 const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(paymentProofs).where(eq(paymentProofs.orderId, order.id));
 if (count >= 6) return fail('This order already has the maximum number of uploads. Please contact us.', 409);
 let file: FormDataEntryValue | null;
 try { file = (await req.formData()).get('proof'); } catch { return fail('Please choose a screenshot or PDF of your payment.'); }
 if (!(file instanceof File) || !file.size) return fail('Please choose a screenshot or PDF of your payment.');
 if (file.size > MAX_PROOF_BYTES) return fail('Please upload a file smaller than 5 MB.', 413);
 if (!PROOF_TYPES.includes(file.type)) return fail('Please upload a JPG, PNG, HEIC or PDF file.', 415);

 const blobKey = `order-${order.id}/${randomUUID()}`;
 await getStore({ name: 'payment-proofs', consistency: 'strong' }).set(blobKey, await file.arrayBuffer(), { metadata: { contentType: file.type, orderId: order.id } });
 await db.insert(paymentProofs).values({ orderId: order.id, blobKey, contentType: file.type });
 await db.update(orders).set({ status: 'proof_uploaded' }).where(and(eq(orders.id, order.id), eq(orders.status, 'awaiting_payment')));
 await notify(req, 'payment-proof', {
  subject: `Payment proof uploaded for ${orderNumber(order.id)}`,
  order: orderNumber(order.id), name: order.customerName, email: order.email, phone: order.phone,
  link: new URL('/admin/', req.url).toString(),
 });
 const found = await loadOrder(eq(orders.id, order.id));
 return Response.json(describeOrder(found!), { headers });
}

export default async (req: Request, context: Context) => {
 const token = context.params?.token;
 if (token !== undefined && !/^[\w-]{20,64}$/.test(token)) return fail('We could not find this order.', 404);
 try {
  if (!token && req.method === 'POST') return await createOrder(req);
  if (token && req.method === 'GET' && !new URL(req.url).pathname.endsWith('/proof')) return await getOrder(token);
  if (token && req.method === 'POST' && new URL(req.url).pathname.endsWith('/proof')) return await uploadProof(req, token);
  return new Response('Method not allowed', { status: 405, headers });
 } catch (error) {
  console.error('Order request failed', error);
  return fail('Something went wrong. Please try again in a moment.', 503);
 }
};

export const config = { path: ['/api/orders', '/api/orders/:token', '/api/orders/:token/proof'] };
