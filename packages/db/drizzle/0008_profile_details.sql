ALTER TABLE "user_profiles" ADD COLUMN "status" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "timezone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "languages" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "platforms" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "playstyles" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "looking_for_group" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "now_playing" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "accounts" jsonb DEFAULT '{}'::jsonb NOT NULL;