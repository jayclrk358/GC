-- Trigram search for fuzzy name matching (pg_trgm is a trusted extension since PG 13).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communities_name_trgm_idx" ON "communities" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_servers_name_trgm_idx" ON "game_servers" USING gin ("name" gin_trgm_ops);
