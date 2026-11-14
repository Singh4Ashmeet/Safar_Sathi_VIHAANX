ALTER TABLE "relay_packets" ADD COLUMN "processing_status" varchar(32) DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "relay_packets" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "relay_packets" ADD COLUMN "next_attempt_at" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "relay_packets" ADD COLUMN "lease_until" bigint;--> statement-breakpoint
ALTER TABLE "relay_packets" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "relay_packets" ADD COLUMN "sos_created_at" bigint;--> statement-breakpoint
ALTER TABLE "relay_packets" ADD COLUMN "updated_at" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "relay_packets_processing_idx" ON "relay_packets" USING btree ("processing_status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "relay_packets" ADD CONSTRAINT "relay_packets_processing_status_check" CHECK ("relay_packets"."processing_status" IN ('pending', 'processing', 'completed', 'exhausted'));--> statement-breakpoint
ALTER TABLE "relay_packets" ADD CONSTRAINT "relay_packets_attempts_check" CHECK ("relay_packets"."attempts" >= 0 AND "relay_packets"."attempts" <= 10);