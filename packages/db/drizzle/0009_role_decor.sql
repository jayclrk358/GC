ALTER TABLE "roles" ADD COLUMN "icon_key" text;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "name_style" jsonb DEFAULT '{"effect":"none","color2":null,"animation":"none"}'::jsonb NOT NULL;