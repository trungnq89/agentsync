ALTER TABLE "agent_tokens" ADD COLUMN "scope" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD COLUMN "legacy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "agent_tokens" SET "scope" = 'manager', "legacy" = true, "expires_at" = now() + interval '90 days';--> statement-breakpoint
ALTER TABLE "agent_tokens" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_scope_check" CHECK ("agent_tokens"."scope" in ('member', 'manager'));
