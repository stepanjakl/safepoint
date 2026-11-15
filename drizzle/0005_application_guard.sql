-- Written by hand (drizzle-kit generate --custom), as 0001_guards.sql is.
-- The guard on applications, replaced so that read_process (0004) is part of
-- what an application wrote and never changes. Its lease (holder,
-- heartbeat_at), the error, the undo marker and the times may change; the
-- status still moves only forward. server/db/schema.test.ts proves it.
CREATE OR REPLACE FUNCTION "safepoint_application_moves_forward"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'applications rows are never removed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW.id, NEW.process, NEW.read_process, NEW.read_id, NEW.fingerprint,
      NEW.proposal_id, NEW.resource, NEW.range, NEW.written_at,
      NEW.adds_resource)
     IS DISTINCT FROM
     (OLD.id, OLD.process, OLD.read_process, OLD.read_id, OLD.fingerprint,
      OLD.proposal_id, OLD.resource, OLD.range, OLD.written_at,
      OLD.adds_resource)
     OR NEW.before::text IS DISTINCT FROM OLD.before::text
     OR NEW.after::text IS DISTINCT FROM OLD.after::text
     OR NEW.changes::text IS DISTINCT FROM OLD.changes::text
     OR NEW.decisions::text IS DISTINCT FROM OLD.decisions::text THEN
    RAISE EXCEPTION 'what an application wrote is never changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT (
    NEW.status = OLD.status
    OR (OLD.status = 'pending' AND NEW.status IN ('verified', 'mismatch', 'failed'))
    OR (OLD.status IN ('verified', 'mismatch') AND NEW.status = 'undone')
  ) THEN
    RAISE EXCEPTION 'an application cannot move from % to %', OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
