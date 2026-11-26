import type { Context } from '@netlify/functions';
import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { orderItems, orders, paymentProofs, productStock } from '../../db/schema.js';
import { products } from '../../public/catalog.mjs';
import { cancelOrder, describeOrder, loadOrder, sameOrigin, stockMap } from '../../lib/shop.js';

const headers = { 'Cache-Control': 'no-store' };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });
const STATUSES = ['awaiting_payment', 'proof_uploaded', 'paid', 'shipped', 'cancelled'];

async function listOrders(url: URL) {
 const status = url.searchParams.get('status');
 const where = status === 'open' ? inArray(orders.status, ['awaiting_payment', 'proof_uploaded', 'paid'])
  : STATUSES.includes(status ?? '') ? eq(orders.status, status!) : undefined;
 const rows = await db.select({ id: orders.id }).from(orders).where(where).orderBy(desc(orders.createdAt)).limit(200);
 const list = [];
 for (const { id } of rows) { const found = await loadOrder(eq(orders.id, id)); if (found) list.push(describeOrder(found, true)); }
 return Response.json({ orders: list }, { headers });
}

async function updateOrder(id: number, body: Record<string, unknown>) {
 const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
 if (!order) return fail('Order not found.', 404);
 const action = body.action;
 if (action === 'mark_paid') {
  if (!['awaiting_payment', 'proof_uploaded', 'cancelled'].includes(order.status)) return fail('This order is already paid.');
  if (order.status === 'cancelled') {
   // Late payment: re-reserve stock where available, otherwise the units become pre-orders.
   await db.transaction(async tx => {
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    const locked = await tx.select().from(productStock).where(inArray(productStock.productId, items.map(i => i.productId))).for('update');
    for (const item of items) {
     const ready = Math.min(item.quantity, Math.max(0, locked.find(r => r.productId === item.productId)?.stock ?? 0));
     if (ready) await tx.update(productStock).set({ stock: sql`${productStock.stock} - ${ready}`, updatedAt: new Date() }).where(eq(productStock.productId, item.productId));
     await tx.update(orderItems).set({ readyQuantity: ready }).where(and(eq(orderItems.orderId, id), eq(orderItems.productId, item.productId)));
    }
    await tx.update(orders).set({ status: 'paid', paidAt: new Date(), cancelledAt: null }).where(eq(orders.id, id));
   });
  } else await db.update(orders).set({ status: 'paid', paidAt: new Date() }).where(eq(orders.id, id));
 } else if (action === 'set_delivery_fee') {
  const fee = Number(body.fee);
  if (!Number.isFinite(fee) || fee < 0 || fee > 5000) return fail('Enter a delivery fee between RM 0 and RM 5000.');
  const feeSen = Math.round(fee * 100);
  await db.update(orders).set({ deliveryFeeSen: feeSen, deliveryPaid: feeSen === 0 ? true : order.deliveryPaid && order.deliveryFeeSen === feeSen }).where(eq(orders.id, id));
 } else if (action === 'mark_delivery_paid') {
  if (order.deliveryFeeSen === null) return fail('Set the delivery fee first.');
  await db.update(orders).set({ deliveryPaid: true }).where(eq(orders.id, id));
 } else if (action === 'mark_shipped') {
  if (!['paid', 'shipped'].includes(order.status)) return fail('Mark the order as paid before shipping it.');
  const tracking = typeof body.tracking === 'string' ? body.tracking.trim().slice(0, 300) : '';
  await db.update(orders).set({ status: 'shipped', shippedAt: order.shippedAt ?? new Date(), trackingInfo: tracking }).where(eq(orders.id, id));
 } else if (action === 'cancel') {
  if (!(await cancelOrder(id, ['awaiting_payment', 'proof_uploaded', 'paid']))) return fail('This order cannot be cancelled.');
 } else if (action === 'note') {
  const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : '';
  await db.update(orders).set({ adminNote: note }).where(eq(orders.id, id));
 } else return fail('Unknown action.');
 const found = await loadOrder(eq(orders.id, id));
 return Response.json(describeOrder(found!, true), { headers });
}

async function getProof(id: number) {
 const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, id)).limit(1);
 if (!proof) return fail('File not found.', 404);
 const data = await getStore({ name: 'payment-proofs', consistency: 'strong' }).get(proof.blobKey, { type: 'arrayBuffer' });
 if (!data) return fail('File not found.', 404);
 return new Response(data, { headers: { ...headers, 'Content-Type': proof.contentType, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" } });
}

async function stock(req: Request) {
 if (req.method === 'POST') {
  const body = await req.json().catch(() => null);
  const updates = body?.stock;
  if (!updates || typeof updates !== 'object') return fail('Send stock numbers.');
  for (const [productId, value] of Object.entries(updates)) {
   if (!products.some(p => p.id === productId)) continue;
   const count = Number(value);
   if (!Number.isInteger(count) || count < 0 || count > 100000) return fail('Stock must be a whole number of 0 or more.');
   await db.insert(productStock).values({ productId, stock: count }).onConflictDoUpdate({ target: productStock.productId, set: { stock: count, updatedAt: new Date() } });
  }
 }
 const map = await stockMap();
 return Response.json({ stock: products.map(p => ({ id: p.id, name: p.name, image: p.image, price: p.price, stock: map.get(p.id) ?? 0 })) }, { headers });
}

export default async (req: Request, context: Context) => {
 if (req.method !== 'GET' && !sameOrigin(req)) return fail('Forbidden', 403);
 const user = await getUser();
 if (!user) return fail('Please log in.', 401);
 if (!user.roles?.includes('admin')) return fail('This account does not have admin access.', 403);
 const url = new URL(req.url);
 try {
  if (url.pathname === '/api/admin/me') return Response.json({ email: user.email }, { headers });
  if (url.pathname === '/api/admin/stock') return await stock(req);
  if (url.pathname === '/api/admin/orders' && req.method === 'GET') return await listOrders(url);
  const id = Number(context.params?.id);
  if (url.pathname.startsWith('/api/admin/orders/') && req.method === 'POST' && Number.isInteger(id)) {
   const body = await req.json().catch(() => null);
   if (!body || typeof body !== 'object') return fail('Send a valid action.');
   return await updateOrder(id, body);
  }
  if (url.pathname.startsWith('/api/admin/proofs/') && req.method === 'GET' && Number.isInteger(id)) return await getProof(id);
  return fail('Not found.', 404);
 } catch (error) {
  console.error('Admin request failed', error);
  return fail('Something went wrong. Please try again.', 503);
 }
};

export const config = { path: ['/api/admin/me', '/api/admin/stock', '/api/admin/orders', '/api/admin/orders/:id', '/api/admin/proofs/:id'] };
