CREATE TABLE "odoo_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"url" text,
	"database" text,
	"login" text,
	"api_key_enc" text,
	"mode" text DEFAULT 'review' NOT NULL,
	"schedule_hours" integer DEFAULT 0 NOT NULL,
	"title_mapping_enabled" boolean DEFAULT false NOT NULL,
	"title_mappings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "odoo_settings_singleton" CHECK ("odoo_settings"."id" = 1),
	CONSTRAINT "odoo_settings_mode_check" CHECK ("odoo_settings"."mode" in ('full','incremental','review')),
	CONSTRAINT "odoo_settings_schedule_check" CHECK ("odoo_settings"."schedule_hours" in (0,1,6,24))
);
--> statement-breakpoint
CREATE TABLE "odoo_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"trigger" text NOT NULL,
	"actor_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"preview" jsonb,
	"error_key" text,
	CONSTRAINT "odoo_sync_runs_trigger_check" CHECK ("odoo_sync_runs"."trigger" in ('manual','schedule')),
	CONSTRAINT "odoo_sync_runs_status_check" CHECK ("odoo_sync_runs"."status" in ('previewed','applied','failed'))
);
--> statement-breakpoint
CREATE TABLE "pending_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"secret_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "odoo_employee_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "source" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "odoo_sync_runs" ADD CONSTRAINT "odoo_sync_runs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_credentials" ADD CONSTRAINT "pending_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_credentials" ADD CONSTRAINT "pending_credentials_run_id_odoo_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."odoo_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_odoo_employee_id_unique" UNIQUE("odoo_employee_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_source_check" CHECK ("users"."source" in ('local','odoo'));
INSERT INTO "odoo_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;