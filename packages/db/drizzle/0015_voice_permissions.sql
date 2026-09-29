-- Voice channels: everyone may connect and speak by default (CONNECT = 1<<14, SPEAK = 1<<15),
-- and roles that can kick members can also mute them in voice (MUTE_MEMBERS = 1<<27).
UPDATE "roles" SET "permissions" = "permissions" | 49152 WHERE "is_default" = true;--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" | 134217728 WHERE ("permissions" & 1048576) <> 0;
