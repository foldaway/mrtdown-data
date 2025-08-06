CREATE TABLE "component_branch_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"component_branch_id" text NOT NULL,
	"station_id" text NOT NULL,
	"code" text NOT NULL,
	"structure_type" text NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"endedAt" timestamp with time zone,
	"order_index" integer NOT NULL,
	CONSTRAINT "component_branch_memberships_unique_idx" UNIQUE("component_branch_id","station_id","code","order_index"),
	CONSTRAINT "type_check" CHECK ("component_branch_memberships"."structure_type" IN ('elevated', 'underground', 'at_grade', 'in_building'))
);
--> statement-breakpoint
CREATE TABLE "component_branches" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"component_id" text NOT NULL,
	"title" text,
	"title_zh-Hans" text NOT NULL,
	"title_ms" text NOT NULL,
	"title_ta" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "component_branches_unique_idx" UNIQUE("component_id","code")
);
--> statement-breakpoint
CREATE TABLE "components" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_zh-Hans" text NOT NULL,
	"title_ms" text NOT NULL,
	"title_ta" text NOT NULL,
	"type" text NOT NULL,
	"hash" "bytea" NOT NULL,
	CONSTRAINT "type_check" CHECK ("components"."type" IN ('mrt.high', 'mrt.medium', 'lrt'))
);
--> statement-breakpoint
CREATE TABLE "issue_component_branch_memberships" (
	"component_branch_membership_id" integer NOT NULL,
	"issue_id" text NOT NULL,
	CONSTRAINT "issue_component_branch_memberships_issue_id_component_branch_membership_id_pk" PRIMARY KEY("issue_id","component_branch_membership_id")
);
--> statement-breakpoint
CREATE TABLE "issue_intervals" (
	"issue_id" text NOT NULL,
	"startAt" timestamp with time zone NOT NULL,
	"endAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "issue_subtype_memberships" (
	"subtype_type" text NOT NULL,
	"issue_id" text NOT NULL,
	CONSTRAINT "issue_subtype_memberships_issue_id_subtype_type_pk" PRIMARY KEY("issue_id","subtype_type")
);
--> statement-breakpoint
CREATE TABLE "issue_subtypes" (
	"type" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_updates" (
	"issue_id" text NOT NULL,
	"text" text NOT NULL,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "issue_updates_unique_idx" UNIQUE("issue_id","source_url")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_zh-Hans" text NOT NULL,
	"title_ms" text NOT NULL,
	"title_ta" text NOT NULL,
	"type" text NOT NULL,
	"hash" "bytea" NOT NULL,
	CONSTRAINT "type_check" CHECK ("issues"."type" IN ('disruption', 'maintenance', 'infra'))
);
--> statement-breakpoint
CREATE TABLE "landmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_zh-Hans" text NOT NULL,
	"title_ms" text NOT NULL,
	"title_ta" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_landmarks" (
	"station_id" text NOT NULL,
	"landmark_id" text NOT NULL,
	CONSTRAINT "station_landmarks_station_id_landmark_id_pk" PRIMARY KEY("station_id","landmark_id")
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"name_zh-Hans" text,
	"name_ms" text,
	"name_ta" text,
	"town_id" text NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"hash" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "towns" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_zh-Hans" text NOT NULL,
	"title_ms" text NOT NULL,
	"title_ta" text NOT NULL,
	CONSTRAINT "towns_title_unique" UNIQUE("title")
);
--> statement-breakpoint
ALTER TABLE "component_branch_memberships" ADD CONSTRAINT "component_branch_memberships_component_branch_id_component_branches_id_fk" FOREIGN KEY ("component_branch_id") REFERENCES "public"."component_branches"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "component_branch_memberships" ADD CONSTRAINT "component_branch_memberships_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_branches" ADD CONSTRAINT "component_branches_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "issue_component_branch_memberships" ADD CONSTRAINT "issue_component_branch_memberships_component_branch_membership_id_component_branch_memberships_id_fk" FOREIGN KEY ("component_branch_membership_id") REFERENCES "public"."component_branch_memberships"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "issue_component_branch_memberships" ADD CONSTRAINT "issue_component_branch_memberships_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "issue_intervals" ADD CONSTRAINT "issue_intervals_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "issue_subtype_memberships" ADD CONSTRAINT "issue_subtype_memberships_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "issue_updates" ADD CONSTRAINT "issue_updates_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "station_landmarks" ADD CONSTRAINT "station_landmarks_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_town_id_towns_id_fk" FOREIGN KEY ("town_id") REFERENCES "public"."towns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "component_branches_code_idx" ON "component_branches" USING btree ("code");--> statement-breakpoint
CREATE INDEX "component_branches_component_id_idx" ON "component_branches" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "components_type_idx" ON "components" USING btree ("type");--> statement-breakpoint
CREATE INDEX "issues_type_idx" ON "issues" USING btree ("type");