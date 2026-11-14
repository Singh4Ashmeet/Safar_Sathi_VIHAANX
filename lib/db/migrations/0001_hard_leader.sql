ALTER TABLE "guardians" ADD CONSTRAINT "guardians_consent_status_check" CHECK ("guardians"."consent_status" IN ('pending', 'granted', 'revoked'));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_status_check" CHECK ("trips"."status" IN ('active', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_escalation_stage_check" CHECK ("trips"."escalation_stage" IS NULL OR "trips"."escalation_stage" IN ('signal_lost', 'user_prompted', 'guardians_alerted'));--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_target_check" CHECK (("share_links"."trip_id" IS NOT NULL AND "share_links"."sos_id" IS NULL) OR ("share_links"."trip_id" IS NULL AND "share_links"."sos_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "sos_deliveries" ADD CONSTRAINT "sos_deliveries_channel_check" CHECK ("sos_deliveries"."channel" IN ('push', 'sms', 'telegram', 'email'));--> statement-breakpoint
ALTER TABLE "sos_deliveries" ADD CONSTRAINT "sos_deliveries_status_check" CHECK ("sos_deliveries"."status" IN ('queued', 'sent', 'failed', 'acknowledged'));--> statement-breakpoint
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_status_check" CHECK ("sos_events"."status" IN ('active', 'acknowledged', 'resolved', 'cancelled'));--> statement-breakpoint
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_source_check" CHECK ("sos_events"."source" IN ('direct', 'ble_gateway'));--> statement-breakpoint
ALTER TABLE "relay_packets" ADD CONSTRAINT "relay_packets_status_check" CHECK ("relay_packets"."status" IN ('accepted', 'duplicate', 'invalid', 'expired'));--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_target_check" CHECK (("escalations"."trip_id" IS NOT NULL AND "escalations"."watch_id" IS NULL) OR ("escalations"."trip_id" IS NULL AND "escalations"."watch_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_stage_check" CHECK ("escalations"."stage" IN ('signal_lost', 'user_prompted', 'guardians_alerted'));--> statement-breakpoint
ALTER TABLE "watch_timers" ADD CONSTRAINT "watch_timers_status_check" CHECK ("watch_timers"."status" IN ('active', 'confirmed', 'expired'));--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_status_check" CHECK ("rides"."status" IN ('active', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_status_check" CHECK ("reports"."status" IN ('pending', 'approved', 'rejected'));--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_severity_check" CHECK ("zones"."severity" IN ('low', 'medium', 'high'));--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_source_check" CHECK ("zones"."source" IN ('seed', 'reports'));--> statement-breakpoint
ALTER TABLE "tick_log" ADD CONSTRAINT "tick_log_source_check" CHECK ("tick_log"."source" IN ('cron', 'github', 'in_process', 'boot_catch_up'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE TRIGGER audit_log_prevent_mod_trigger
BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();
