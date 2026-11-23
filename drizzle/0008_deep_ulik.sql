CREATE TABLE "digest_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"channel" text DEFAULT 'slack' NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "digest_deliveries_user_date_channel_uq" UNIQUE("user_id","local_date","channel"),
	CONSTRAINT "digest_deliveries_status_check" CHECK ("digest_deliveries"."status" in ('sent','skipped_empty','failed'))
);
--> statement-breakpoint
CREATE TABLE "slack_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"bot_token_enc" text,
	"default_enabled" boolean DEFAULT true NOT NULL,
	"default_time" text DEFAULT '08:30' NOT NULL,
	"default_days" integer[] DEFAULT '{1,2,3,4,5}'::integer[] NOT NULL,
	"default_timezone" text,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	CONSTRAINT "slack_settings_singleton" CHECK ("slack_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_enabled" boolean;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_time" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_days" integer[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_timezone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "slack_user_id" text;--> statement-breakpoint
ALTER TABLE "digest_deliveries" ADD CONSTRAINT "digest_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;