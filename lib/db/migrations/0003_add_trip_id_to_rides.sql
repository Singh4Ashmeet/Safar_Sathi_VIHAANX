ALTER TABLE "rides" ADD COLUMN "trip_id" uuid;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rides_trip_id_idx" ON "rides" USING btree ("trip_id");