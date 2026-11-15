ALTER TABLE "runs" DROP CONSTRAINT "runs_rulebook_fk";
--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_read_fk";
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "read_process" text NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "discarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_read_fk" FOREIGN KEY ("read_process","read_id") REFERENCES "public"."reads"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_id_shape" CHECK ("runs"."id" ~ '^[A-Za-z0-9_-]{1,80}$');--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_rulebook_shape" CHECK ("runs"."rulebook_id" is null or "runs"."rulebook_id" ~ '^[0-9a-f]{12}$');