ALTER TABLE "server_rollups_daily" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "server_rollups_daily" CASCADE;--> statement-breakpoint
CREATE INDEX "server_rollups_hourly_hour_brin" ON "server_rollups_hourly" USING brin ("hour");--> statement-breakpoint
CREATE INDEX "server_samples_ts_brin" ON "server_samples" USING brin ("ts");