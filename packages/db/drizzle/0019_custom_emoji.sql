CREATE TABLE "custom_emoji" (
	"id" uuid PRIMARY KEY NOT NULL,
	"community_id" uuid NOT NULL,
	"name" text NOT NULL,
	"image_key" text NOT NULL,
	"creator_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_emoji" ADD CONSTRAINT "custom_emoji_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_emoji" ADD CONSTRAINT "custom_emoji_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_emoji_name_idx" ON "custom_emoji" USING btree ("community_id","name");--> statement-breakpoint
CREATE INDEX "custom_emoji_image_idx" ON "custom_emoji" USING btree ("image_key");