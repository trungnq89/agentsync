ALTER TABLE "digest_deliveries" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "slack_settings" ADD COLUMN "last_error_code" text;