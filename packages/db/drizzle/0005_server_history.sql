CREATE TABLE "server_rollups_daily" (
	"endpoint_id" uuid NOT NULL,
	"samples" integer NOT NULL,
	"online_samples" integer NOT NULL,
	"avg_players" real,
	"peak_players" integer,
	"day" date NOT NULL,
	CONSTRAINT "server_rollups_daily_endpoint_id_day_pk" PRIMARY KEY("endpoint_id","day")
);
--> statement-breakpoint
CREATE TABLE "server_rollups_hourly" (
	"endpoint_id" uuid NOT NULL,
	"samples" integer NOT NULL,
	"online_samples" integer NOT NULL,
	"avg_players" real,
	"peak_players" integer,
	"hour" timestamp with time zone NOT NULL,
	CONSTRAINT "server_rollups_hourly_endpoint_id_hour_pk" PRIMARY KEY("endpoint_id","hour")
);
--> statement-breakpoint
CREATE TABLE "server_samples" (
	"endpoint_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"online" boolean NOT NULL,
	"players" integer,
	"ping_ms" integer,
	CONSTRAINT "server_samples_endpoint_id_ts_pk" PRIMARY KEY("endpoint_id","ts")
) PARTITION BY RANGE ("ts");
--> statement-breakpoint
-- One partition per UTC day. The worker keeps a few days ahead and drops old ones; these cover
-- the first run after migrating.
DO $$
DECLARE d date;
BEGIN
  FOR i IN -1..3 LOOP
    d := (now() AT TIME ZONE 'UTC')::date + i;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF server_samples FOR VALUES FROM (%L) TO (%L)',
      'server_samples_' || to_char(d, 'YYYYMMDD'),
      d::timestamp AT TIME ZONE 'UTC',
      (d + 1)::timestamp AT TIME ZONE 'UTC'
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE "server_votes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"username" text,
	"reward" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_servers" ADD COLUMN "alert_channel_id" uuid;--> statement-breakpoint
ALTER TABLE "game_servers" ADD COLUMN "votifier_host" text;--> statement-breakpoint
ALTER TABLE "game_servers" ADD COLUMN "votifier_port" integer;--> statement-breakpoint
ALTER TABLE "game_servers" ADD COLUMN "votifier_token" text;--> statement-breakpoint
ALTER TABLE "game_servers" ADD COLUMN "votifier_public_key" text;--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD COLUMN "down_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "server_rollups_daily" ADD CONSTRAINT "server_rollups_daily_endpoint_id_server_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."server_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_rollups_hourly" ADD CONSTRAINT "server_rollups_hourly_endpoint_id_server_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."server_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_votes" ADD CONSTRAINT "server_votes_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_votes" ADD CONSTRAINT "server_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_votes_server_idx" ON "server_votes" USING btree ("server_id","created_at");--> statement-breakpoint
CREATE INDEX "server_votes_user_idx" ON "server_votes" USING btree ("user_id","server_id","created_at");--> statement-breakpoint
ALTER TABLE "game_servers" ADD CONSTRAINT "game_servers_alert_channel_id_channels_id_fk" FOREIGN KEY ("alert_channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;