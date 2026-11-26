CREATE TABLE "order_items" (
	"order_id" integer,
	"product_id" text,
	"name" text NOT NULL,
	"unit_price_sen" integer NOT NULL,
	"quantity" integer NOT NULL,
	"ready_quantity" integer NOT NULL,
	CONSTRAINT "order_items_pkey" PRIMARY KEY("order_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY,
	"access_token" text NOT NULL UNIQUE,
	"customer_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"delivery_method" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"subtotal_sen" integer NOT NULL,
	"delivery_fee_sen" integer,
	"delivery_paid" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'awaiting_payment' NOT NULL,
	"tracking_info" text DEFAULT '' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" serial PRIMARY KEY,
	"order_id" integer NOT NULL,
	"blob_key" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_stock" (
	"product_id" text PRIMARY KEY,
	"stock" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" ("status","expires_at");--> statement-breakpoint
CREATE INDEX "payment_proofs_order_idx" ON "payment_proofs" ("order_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;