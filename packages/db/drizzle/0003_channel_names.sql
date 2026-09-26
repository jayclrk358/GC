-- Forum, chat and announcement channels are addressed by name in URLs, so names are unique per
-- community. Categories are just headings and may repeat.
CREATE UNIQUE INDEX IF NOT EXISTS "channels_community_name_idx" ON "channels" ("community_id", "name") WHERE "type" <> 'category';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_unread_idx" ON "notifications" ("user_id") WHERE "read_at" IS NULL;
