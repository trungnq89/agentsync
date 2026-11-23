CREATE TABLE "checkpoint_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"step_title" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"reviewer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "checkpoint_reviews_decision_check" CHECK ("checkpoint_reviews"."decision" in ('approved','rejected'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "checkpoint_confirmer" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "checkpoint_reviews" ADD CONSTRAINT "checkpoint_reviews_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint_reviews" ADD CONSTRAINT "checkpoint_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_checkpoint_confirmer_check" CHECK ("users"."checkpoint_confirmer" in ('member','manager'));