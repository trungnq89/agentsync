ALTER TABLE "users" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_locale_check" CHECK ("users"."locale" in ('en','vi'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_theme_check" CHECK ("users"."theme" in ('system','light','dark'));