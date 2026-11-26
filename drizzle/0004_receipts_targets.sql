CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"promoter_id" uuid NOT NULL,
	"sale_date" date NOT NULL,
	"client_id" text NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"note" text,
	"geo_lat" double precision,
	"geo_lng" double precision,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"promoter_id" uuid NOT NULL,
	"brand_id" uuid,
	"units" integer DEFAULT 0 NOT NULL,
	"incentive" numeric(12, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_promoter_id_users_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_promoter_id_users_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_client_uq" ON "receipts" USING btree ("promoter_id","client_id");--> statement-breakpoint
CREATE INDEX "receipts_outlet_date_idx" ON "receipts" USING btree ("outlet_id","sale_date");--> statement-breakpoint
CREATE UNIQUE INDEX "targets_uq" ON "targets" USING btree ("month","promoter_id","brand_id");--> statement-breakpoint
CREATE INDEX "targets_month_idx" ON "targets" USING btree ("month");