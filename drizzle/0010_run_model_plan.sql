ALTER TABLE "runs" ADD COLUMN "model_plan" text;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "safepoint_run_keeps_its_start"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'runs rows are never removed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW.process, NEW.id, NEW.instructions_hash, NEW.read_process,
      NEW.trigger, NEW.additional_instructions, NEW.model_plan, NEW.started_by,
      NEW.started_at)
     IS DISTINCT FROM
     (OLD.process, OLD.id, OLD.instructions_hash, OLD.read_process,
      OLD.trigger, OLD.additional_instructions, OLD.model_plan, OLD.started_by,
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
