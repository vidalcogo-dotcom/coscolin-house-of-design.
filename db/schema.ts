import { pgTable, text, integer, timestamp, primaryKey, serial, boolean, index } from 'drizzle-orm/pg-core';

export const cartItems = pgTable('cart_items', {
 sessionId: text('session_id').notNull(),
 productId: text('product_id').notNull(),
 quantity: integer('quantity').notNull(),
 updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.sessionId, table.productId] })]);

// Ready-to-ship units per product. Products without a row have 0 in stock (pre-order only).
export const productStock = pgTable('product_stock', {
 productId: text('product_id').primaryKey(),
 stock: integer('stock').notNull().default(0),
 updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Status: awaiting_payment → proof_uploaded → paid → shipped, or cancelled.
export const orders = pgTable('orders', {
 id: serial('id').primaryKey(),
 accessToken: text('access_token').notNull().unique(),
 customerName: text('customer_name').notNull(),
 email: text('email').notNull(),
 phone: text('phone').notNull(),
 address: text('address').notNull(),
 deliveryMethod: text('delivery_method').notNull(),
 notes: text('notes').notNull().default(''),
 language: text('language').notNull().default('es'),
 subtotalSen: integer('subtotal_sen').notNull(),
 deliveryFeeSen: integer('delivery_fee_sen'),
 deliveryPaid: boolean('delivery_paid').notNull().default(false),
 status: text('status').notNull().default('awaiting_payment'),
 trackingInfo: text('tracking_info').notNull().default(''),
 adminNote: text('admin_note').notNull().default(''),
 expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
 paidAt: timestamp('paid_at', { withTimezone: true }),
 shippedAt: timestamp('shipped_at', { withTimezone: true }),
 cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [index('orders_status_idx').on(table.status, table.expiresAt)]);

export const orderItems = pgTable('order_items', {
 orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
 productId: text('product_id').notNull(),
 name: text('name').notNull(),
 unitPriceSen: integer('unit_price_sen').notNull(),
 quantity: integer('quantity').notNull(),
 readyQuantity: integer('ready_quantity').notNull(),
}, table => [primaryKey({ columns: [table.orderId, table.productId] })]);

export const paymentProofs = pgTable('payment_proofs', {
 id: serial('id').primaryKey(),
 orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
 blobKey: text('blob_key').notNull(),
 contentType: text('content_type').notNull(),
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [index('payment_proofs_order_idx').on(table.orderId)]);
