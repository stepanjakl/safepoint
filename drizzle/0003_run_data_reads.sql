ALTER TABLE "answer_parts" DROP CONSTRAINT "answer_parts_read_fk";
--> statement-breakpoint
ALTER TABLE "cross_checks" DROP CONSTRAINT "cross_checks_read_fk";
--> statement-breakpoint
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_read_fk";
--> statement-breakpoint
ALTER TABLE "answer_parts" ADD COLUMN "read_process" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cross_checks" ADD COLUMN "read_process" text NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "read_process" text NOT NULL;--> statement-breakpoint
ALTER TABLE "answer_parts" ADD CONSTRAINT "answer_parts_read_fk" FOREIGN KEY ("read_process","read_id") REFERENCES "public"."reads"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_checks" ADD CONSTRAINT "cross_checks_read_fk" FOREIGN KEY ("read_process","read_id") REFERENCES "public"."reads"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_read_fk" FOREIGN KEY ("read_process","read_id") REFERENCES "public"."reads"("process","id") ON DELETE restrict ON UPDATE no action;