ALTER TABLE "components" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;