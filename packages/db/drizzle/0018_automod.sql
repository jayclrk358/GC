CREATE TABLE "automod_settings" (
	"community_id" uuid PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"joins_paused_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "held_posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"community_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"kind" text NOT NULL,
	"channel_id" uuid NOT NULL,
	"thread_id" uuid,
	"payload" jsonb NOT NULL,
	"title" text,
	"text" text DEFAULT '' NOT NULL,
	"rule" text NOT NULL,
	"match" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"result_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automod_settings" ADD CONSTRAINT "automod_settings_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "held_posts" ADD CONSTRAINT "held_posts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "held_posts" ADD CONSTRAINT "held_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "held_posts" ADD CONSTRAINT "held_posts_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "held_posts" ADD CONSTRAINT "held_posts_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "held_posts_queue_idx" ON "held_posts" USING btree ("community_id","status","created_at");--> statement-breakpoint
CREATE INDEX "held_posts_author_idx" ON "held_posts" USING btree ("author_id");