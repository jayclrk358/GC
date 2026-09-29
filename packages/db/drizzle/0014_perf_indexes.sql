DROP INDEX "post_reactions_post_idx";--> statement-breakpoint
DROP INDEX "members_user_idx";--> statement-breakpoint
CREATE INDEX "members_community_joined_idx" ON "members" USING btree ("community_id","joined_at");--> statement-breakpoint
CREATE INDEX "uploads_community_idx" ON "uploads" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "threads_channel_recent_idx" ON "threads" USING btree ("channel_id","last_activity_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "wiki_revisions_author_idx" ON "wiki_revisions" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" USING btree ("user_id","joined_at");