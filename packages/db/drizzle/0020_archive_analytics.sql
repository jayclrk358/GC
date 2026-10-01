ALTER TABLE "communities" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "posts_community_idx" ON "posts" USING btree ("community_id","id");