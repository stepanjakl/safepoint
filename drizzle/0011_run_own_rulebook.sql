CREATE TABLE "run_rulebooks" (
	"process" text NOT NULL,
	"run_id" text NOT NULL,
	"instructions_hash" text NOT NULL,
	"body" json NOT NULL,
	"schema_version" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "run_rulebooks_process_run_id_pk" PRIMARY KEY("process","run_id"),
	CONSTRAINT "run_rulebooks_body_hash" CHECK ("run_rulebooks"."instructions_hash" is not distinct from ("run_rulebooks"."body" ->> 'hash'))
);
--> statement-breakpoint
ALTER TABLE "rule_decisions" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "rulebook_revisions" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "own_rulebook" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "run_rulebooks" ADD CONSTRAINT "run_rulebooks_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_rulebooks" ADD CONSTRAINT "run_rulebooks_run_fk" FOREIGN KEY ("process","run_id") REFERENCES "public"."runs"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_rulebooks" ADD CONSTRAINT "run_rulebooks_instructions_fk" FOREIGN KEY ("process","instructions_hash") REFERENCES "public"."instruction_versions"("process","hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER "run_rulebooks_next_revision" BEFORE UPDATE ON "run_rulebooks" FOR EACH ROW EXECUTE FUNCTION "safepoint_next_revision"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "safepoint_run_keeps_its_start"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'runs rows are never removed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW.process, NEW.id, NEW.instructions_hash, NEW.read_process,
      NEW.trigger, NEW.additional_instructions, NEW.model_plan, NEW.own_rulebook, NEW.started_by,
      NEW.started_at)
     IS DISTINCT FROM
     (OLD.process, OLD.id, OLD.instructions_hash, OLD.read_process,
      OLD.trigger, OLD.additional_instructions, OLD.model_plan, OLD.own_rulebook, OLD.started_by,
      OLD.started_at) THEN
    RAISE EXCEPTION 'what a run started with is never changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.discarded_at IS NOT NULL AND (
    NEW.discarded_at IS DISTINCT FROM OLD.discarded_at
    OR (NEW.read_id, NEW.rulebook_id, NEW.stage, NEW.status)
       IS DISTINCT FROM (OLD.read_id, OLD.rulebook_id, OLD.stage, OLD.status)
  ) THEN
    RAISE EXCEPTION 'a discarded run moves no further'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
