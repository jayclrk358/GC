CREATE TABLE "link_previews" (
	"url_hash" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"ok" boolean NOT NULL,
	"data" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"message_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"author_id" text,
	"body" jsonb NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"reply_to_id" uuid,
	"mention_user_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"mention_role_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"mention_everyone" boolean DEFAULT false NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embeds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nonce" text,
	"pinned_at" timestamp with time zone,
	"pinned_by" text,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, coalesce(content, ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "read_states" (
	"user_id" text NOT NULL,
	"channel_id" uuid NOT NULL,
	"last_read_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_states_user_id_channel_id_pk" PRIMARY KEY("user_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_states" ADD CONSTRAINT "read_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_states" ADD CONSTRAINT "read_states_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_channel_idx" ON "messages" USING btree ("channel_id","id");--> statement-breakpoint
CREATE INDEX "messages_community_idx" ON "messages" USING btree ("community_id","id");--> statement-breakpoint
CREATE INDEX "messages_author_idx" ON "messages" USING btree ("author_id","id");--> statement-breakpoint
CREATE INDEX "messages_search_idx" ON "messages" USING gin ("search");--> statement-breakpoint
CREATE INDEX "messages_mention_users_idx" ON "messages" USING gin ("mention_user_ids");--> statement-breakpoint
CREATE INDEX "messages_mention_roles_idx" ON "messages" USING gin ("mention_role_ids");--> statement-breakpoint
CREATE INDEX "messages_pinned_idx" ON "messages" USING btree ("channel_id","pinned_at") WHERE pinned_at is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_nonce_idx" ON "messages" USING btree ("author_id","nonce") WHERE nonce is not null;