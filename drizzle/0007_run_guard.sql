-- Written by hand (drizzle-kit generate --custom), as 0001_guards.sql is.
-- A run is history: it is never removed, what it started with never changes,
-- and once discarded it moves no further and stays discarded. Its read, its
-- pinned rulebook, its stage and status move while it runs
-- (server/storage/runs.ts). server/db/schema.test.ts proves it.
CREATE FUNCTION "safepoint_run_keeps_its_start"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'runs rows are never removed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW.process, NEW.id, NEW.instructions_hash, NEW.read_process,
      NEW.trigger, NEW.additional_instructions, NEW.started_by,
      NEW.started_at)
     IS DISTINCT FROM
     (OLD.process, OLD.id, OLD.instructions_hash, OLD.read_process,
      OLD.trigger, OLD.additional_instructions, OLD.started_by,
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
--> statement-breakpoint
CREATE TRIGGER "runs_keep_their_start" BEFORE UPDATE OR DELETE ON "runs" FOR EACH ROW EXECUTE FUNCTION "safepoint_run_keeps_its_start"();
