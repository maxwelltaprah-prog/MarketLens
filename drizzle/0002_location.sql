CREATE TABLE "location_pings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy_m" real,
	"speed_mps" real,
	"heading_deg" real,
	"altitude_m" real,
	"outlet_id" uuid,
	"entry_id" uuid,
	"distance_m" integer,
	"battery" real,
	"online" boolean,
	"ip" text,
	"user_agent" text,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "geo_status" text;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "geo_distance_m" integer;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "geo_lat" double precision;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "geo_lng" double precision;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_pings_user_time_idx" ON "location_pings" USING btree ("user_id","captured_at");--> statement-breakpoint
CREATE INDEX "location_pings_entry_idx" ON "location_pings" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "location_pings_time_idx" ON "location_pings" USING btree ("captured_at");