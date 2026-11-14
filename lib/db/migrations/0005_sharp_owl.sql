ALTER TABLE "sos_events" ADD COLUMN "last_lat" double precision;--> statement-breakpoint
ALTER TABLE "sos_events" ADD COLUMN "last_lng" double precision;--> statement-breakpoint
ALTER TABLE "sos_events" ADD COLUMN "location_accuracy_m" double precision;--> statement-breakpoint
ALTER TABLE "sos_events" ADD COLUMN "battery" integer;--> statement-breakpoint
ALTER TABLE "sos_events" ADD COLUMN "last_location_at" bigint;