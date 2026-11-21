ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id" = 1);
INSERT INTO "app_settings" ("id", "stale_business_days") VALUES (1, 3) ON CONFLICT ("id") DO NOTHING;
