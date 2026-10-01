CREATE TABLE "user_consents" (
	"user_id" text PRIMARY KEY NOT NULL,
	"terms_version" integer DEFAULT 0 NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"adult_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;