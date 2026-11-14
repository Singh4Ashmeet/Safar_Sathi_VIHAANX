CREATE TABLE "users" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" varchar(32) NOT NULL,
	"lang" varchar(10) DEFAULT 'en' NOT NULL,
	"box_pub" text NOT NULL,
	"sign_pub" text NOT NULL,
	"expo_push_token" text,
	"adult_confirmed_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"name" text NOT NULL,
	"phone_e164" varchar(32) NOT NULL,
	"email" text,
	"relationship" varchar(64) NOT NULL,
	"channels" text[] NOT NULL,
	"telegram_chat_id" text,
	"consent_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"guardian_user_id" varchar(128),
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"ts" bigint NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"acc" double precision
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"destination" text NOT NULL,
	"dest_lat" double precision NOT NULL,
	"dest_lng" double precision NOT NULL,
	"route_polyline" text NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"started_at" bigint NOT NULL,
	"eta_at" bigint,
	"ended_at" bigint,
	"last_seen_at" bigint,
	"last_lat" double precision,
	"last_lng" double precision,
	"next_check_at" bigint,
	"escalation_stage" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"trip_id" uuid,
	"sos_id" uuid,
	"guardian_id" uuid,
	"expires_at" bigint NOT NULL,
	"revoked_at" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sos_acks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sos_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"ack_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sos_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sos_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"channel" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"provider_ref" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sos_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"trip_id" uuid,
	"trigger" varchar(32) NOT NULL,
	"duress" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"source" varchar(32) DEFAULT 'direct' NOT NULL,
	"gateway_device_hash" text,
	"created_at" bigint NOT NULL,
	"received_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relay_packets" (
	"event_id" varchar(64) PRIMARY KEY NOT NULL,
	"raw" text NOT NULL,
	"dest_tag" varchar(32) NOT NULL,
	"received_at" bigint NOT NULL,
	"status" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid,
	"watch_id" uuid,
	"stage" varchar(32) NOT NULL,
	"fired_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_timers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"ends_at" bigint NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"plate" varchar(64) NOT NULL,
	"driver_name" text,
	"started_at" bigint NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"category" varchar(64) NOT NULL,
	"note" text,
	"reporter_hash" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" double precision NOT NULL,
	"category" varchar(64) NOT NULL,
	"severity" varchar(32) NOT NULL,
	"source" varchar(32) NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"ts" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" varchar(64) NOT NULL,
	"day" varchar(16) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"polyline" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"distance_m" double precision NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tick_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"received_at" bigint NOT NULL,
	"source" varchar(32) NOT NULL,
	"trips_checked" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_points" ADD CONSTRAINT "trip_points_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_sos_id_sos_events_id_fk" FOREIGN KEY ("sos_id") REFERENCES "public"."sos_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_acks" ADD CONSTRAINT "sos_acks_sos_id_sos_events_id_fk" FOREIGN KEY ("sos_id") REFERENCES "public"."sos_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_acks" ADD CONSTRAINT "sos_acks_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_deliveries" ADD CONSTRAINT "sos_deliveries_sos_id_sos_events_id_fk" FOREIGN KEY ("sos_id") REFERENCES "public"."sos_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_deliveries" ADD CONSTRAINT "sos_deliveries_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_watch_id_watch_timers_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watch_timers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_timers" ADD CONSTRAINT "watch_timers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardians_user_id_idx" ON "guardians" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_points_trip_id_ts_idx" ON "trip_points" USING btree ("trip_id","ts");--> statement-breakpoint
CREATE INDEX "trip_points_trip_id_idx" ON "trip_points" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trips_next_check_at_idx" ON "trips" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "trips_user_id_idx" ON "trips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_links_trip_id_idx" ON "share_links" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "share_links_sos_id_idx" ON "share_links" USING btree ("sos_id");--> statement-breakpoint
CREATE INDEX "share_links_token_hash_idx" ON "share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sos_acks_sos_id_idx" ON "sos_acks" USING btree ("sos_id");--> statement-breakpoint
CREATE INDEX "sos_deliveries_sos_id_idx" ON "sos_deliveries" USING btree ("sos_id");--> statement-breakpoint
CREATE INDEX "sos_deliveries_guardian_id_idx" ON "sos_deliveries" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "sos_events_user_id_idx" ON "sos_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sos_events_status_idx" ON "sos_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "relay_packets_received_at_idx" ON "relay_packets" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "relay_packets_dest_tag_idx" ON "relay_packets" USING btree ("dest_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "escalations_trip_id_stage_idx" ON "escalations" USING btree ("trip_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "escalations_watch_id_stage_idx" ON "escalations" USING btree ("watch_id","stage");--> statement-breakpoint
CREATE INDEX "watch_timers_user_id_idx" ON "watch_timers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "watch_timers_ends_at_idx" ON "watch_timers" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "rides_user_id_idx" ON "rides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_hash_idx" ON "reports" USING btree ("reporter_hash");--> statement-breakpoint
CREATE INDEX "reports_coords_idx" ON "reports" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "zones_coords_idx" ON "zones" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "audit_log_ts_idx" ON "audit_log" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_usage_service_day_idx" ON "quota_usage" USING btree ("service","day");--> statement-breakpoint
CREATE INDEX "route_cache_created_at_idx" ON "route_cache" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tick_log_received_at_idx" ON "tick_log" USING btree ("received_at");