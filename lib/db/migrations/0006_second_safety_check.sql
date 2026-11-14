ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_escalation_stage_check";--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_escalation_stage_check" CHECK ("trips"."escalation_stage" IS NULL OR "trips"."escalation_stage" IN ('signal_lost', 'user_prompted', 'second_prompted', 'guardians_alerted'));
