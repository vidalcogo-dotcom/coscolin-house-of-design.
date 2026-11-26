import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { orderItems, orders, paymentProofs, productStock } from '../db/schema.js';
import { products } from '../public/catalog.mjs';

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const orderNumber = (id: number) => `COS-${1000 + id}`;
export const newToken = () => randomBytes(24).toString('base64url');
export const sameOrigin = (req: Request) => req.headers.get('origin') === new URL(req.url).origin;

export const BAG_COOKIE = /(?:^|;\s*)coscolin_bag=([\w-]{36})(?:;|$)/;

/** Stock per catalog product. Products without a stock row have 0 (pre-order). */
export async function stockMap(conn: Db | Tx = db) {
 const rows = await conn.select().from(productStock);
 const map = new Map(products.map(p => [p.id, 0]));
 for (const row of rows) if (map.has(row.productId)) map.set(row.productId, Math.max(0, row.stock));
 return map;
}

/** Return reserved ready-to-ship units to stock (used when an order is cancelled). */
export async function restoreStock(tx: Tx, orderId: number) {
 const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
 for (const item of items) {
  if (item.readyQuantity <= 0) continue;
  await tx.insert(productStock).values({ productId: item.productId, stock: item.readyQuantity })
   .onConflictDoUpdate({ target: productStock.productId, set: { stock: sql`${productStock.stock} + ${item.readyQuantity}`, updatedAt: new Date() } });
 }
}

export async function loadOrder(where: ReturnType<typeof eq>) {
 const [order] = await db.select().from(orders).where(where).limit(1);
 if (!order) return null;
 const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
 const proofs = await db.select({ id: paymentProofs.id, contentType: paymentProofs.contentType, createdAt: paymentProofs.createdAt })
  .from(paymentProofs).where(eq(paymentProofs.orderId, order.id));
 return { order, items, proofs };
}

export function describeOrder({ order, items, proofs }: NonNullable<Awaited<ReturnType<typeof loadOrder>>>, admin = false) {
 const product = (id: string) => products.find(p => p.id === id);
 const deliveryFeeSen = order.deliveryFeeSen;
 const itemsPaid = ['paid', 'shipped'].includes(order.status);
 const dueSen = order.status === 'cancelled' ? 0
  : (itemsPaid ? 0 : order.subtotalSen) + (deliveryFeeSen && !order.deliveryPaid ? deliveryFeeSen : 0);
 const base = {
  number: orderNumber(order.id),
  status: order.status,
  createdAt: order.createdAt,
  expiresAt: order.expiresAt,
  deliveryMethod: order.deliveryMethod,
  subtotalSen: order.subtotalSen,
  deliveryFeeSen,
  deliveryPaid: order.deliveryPaid,
  dueSen,
  trackingInfo: order.trackingInfo,
  customerName: order.customerName,
  proofCount: proofs.length,
  items: items.map(i => ({ productId: i.productId, name: i.name, image: product(i.productId)?.image ?? '', unitPriceSen: i.unitPriceSen, quantity: i.quantity, readyQuantity: i.readyQuantity })),
 };
 if (!admin) return base;
 return { ...base, id: order.id, accessToken: order.accessToken, email: order.email, phone: order.phone, address: order.address, notes: order.notes, language: order.language, adminNote: order.adminNote, paidAt: order.paidAt, shippedAt: order.shippedAt, cancelledAt: order.cancelledAt, proofs };
}

export const money = (sen: number) => `RM ${(sen / 100).toFixed(2)}`;

/** Sends a notification through a Netlify Form so Vidal gets an email. Failures never block the customer. */
export async function notify(req: Request, formName: string, fields: Record<string, string>) {
 try {
  const body = new URLSearchParams({ 'form-name': formName, ...fields });
  await fetch(new URL('/__forms.html', req.url), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
 } catch (error) { console.error('Notification failed', formName, error); }
}

/** Cancels an order once (only from the given statuses) and puts its reserved stock back. */
export async function cancelOrder(id: number, fromStatuses: string[]) {
 return db.transaction(async tx => {
  const [cancelled] = await tx.update(orders).set({ status: 'cancelled', cancelledAt: new Date() })
   .where(sql`${orders.id} = ${id} and ${orders.status} in (${sql.join(fromStatuses.map(s => sql`${s}`), sql`, `)})`)
   .returning({ id: orders.id });
  if (!cancelled) return false;
  await restoreStock(tx, id);
  return true;
 });
}

/** Cancels every unpaid order past its payment deadline. */
export async function expireOverdueOrders() {
 const overdue = await db.select({ id: orders.id }).from(orders)
  .where(sql`${orders.status} = 'awaiting_payment' and ${orders.expiresAt} < now()`);
 let count = 0;
 for (const { id } of overdue) if (await cancelOrder(id, ['awaiting_payment'])) count++;
 return count;
}
