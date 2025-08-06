ALTER TABLE "issues" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;