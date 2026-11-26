DROP INDEX "sales_uq";--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_client_uq" ON "sales" USING btree ("promoter_id","client_id");--> statement-breakpoint
CREATE INDEX "sales_outlet_date_idx" ON "sales" USING btree ("outlet_id","sale_date");