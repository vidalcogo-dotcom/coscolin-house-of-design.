import { pgTable, text, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';
export const cartItems = pgTable('cart_items', {
 sessionId: text('session_id').notNull(),
 productId: text('product_id').notNull(),
 quantity: integer('quantity').notNull(),
 updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.sessionId, table.productId] })]);
