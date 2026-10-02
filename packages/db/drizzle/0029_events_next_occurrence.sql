ALTER TABLE "events" ADD COLUMN "next_occurrence_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "events_next_occurrence_idx" ON "events" USING btree ("next_occurrence_at");