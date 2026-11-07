CREATE TABLE "cart_items" (
	"session_id" text,
	"product_id" text,
	"quantity" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_pkey" PRIMARY KEY("session_id","product_id")
);
