-- The app was renamed Game Central, and its default theme preset and sound pack with it. Stored
-- choices of the old names (the app's previous name, "magnox") move to the new ones.
UPDATE "communities" SET "theme" = jsonb_set("theme", '{preset}', '"gamecentral"') WHERE "theme"->>'preset' = 'magnox';
--> statement-breakpoint
UPDATE "user_preferences" SET "prefs" = replace("prefs"::text, '"magnox"', '"gamecentral"')::jsonb WHERE "prefs"::text LIKE '%"magnox"%';
