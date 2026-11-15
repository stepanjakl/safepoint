ALTER TABLE "applications" DROP CONSTRAINT "applications_read_fk";
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "read_process" text NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "holder" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "model_attempts" ADD COLUMN "requests" integer;--> statement-breakpoint
ALTER TABLE "model_attempts" ADD COLUMN "waited_ms" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_read_fk" FOREIGN KEY ("read_process","read_id") REFERENCES "public"."reads"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_held" CHECK (("applications"."holder" is null) = ("applications"."heartbeat_at" is null));