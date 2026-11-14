-- Written by hand (drizzle-kit generate --custom): the generator cannot write
-- functions or triggers, and keeps no record of them, so regenerating neither
-- repeats nor drops this file. server/db/schema.test.ts proves each guard.

-- A row written once: evidence, accepted rulebooks, confirmed profiles,
-- instruction versions, proposals and decisions are never changed or removed.
CREATE FUNCTION "safepoint_written_once"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are written once: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "instruction_versions_written_once" BEFORE UPDATE OR DELETE ON "instruction_versions" FOR EACH ROW EXECUTE FUNCTION "safepoint_written_once"();
--> statement-breakpoint
CREATE TRIGGER "reads_written_once" BEFORE UPDATE OR DELETE ON "reads" FOR EACH ROW EXECUTE FUNCTION "safepoint_written_once"();
--> statement-breakpoint
CREATE TRIGGER "source_reads_written_once" BEFORE UPDATE OR DELETE ON "source_reads" FOR EACH ROW EXECUTE FUNCTION "safepoint_written_once"();
--> statement-breakpoint
CREATE TRIGGER "data_profiles_written_once" BEFORE UPDATE OR DELETE ON "data_profiles" FOR EACH ROW EXECUTE FUNCTION "safepoint_written_once"();
--> statement-breakpoint
CREATE TRIGGER "rulebook_revisions_written_once" BEFORE UPDATE OR DELETE ON "rulebook_revisions" FOR EACH ROW EXECUTE FUNCTION "safepoint_written_once"();
--> statement-breakpoint
CREATE TRIGGER "proposals_written_once" BEFORE UPDATE OR DELETE ON "proposals" FOR EACH ROW EXECUTE FUNCTION "safepoint_written_once"();
--> statement-breakpoint
CREATE TRIGGER "record_decisions_written_once" BEFORE UPDATE OR DELETE ON "record_decisions" FOR EACH ROW EXECUTE FUNCTION "safepoint_written_once"();
--> statement-breakpoint
CREATE TRIGGER "rule_decisions_written_once" BEFORE UPDATE OR DELETE ON "rule_decisions" FOR EACH ROW EXECUTE FUNCTION "safepoint_written_once"();
--> statement-breakpoint

-- A row updated by compare-and-set: every update moves its counter on by one,
-- whatever the statement set it to, so a writer holding the old counter
-- matches nothing.
CREATE FUNCTION "safepoint_next_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "current_rulebooks_next_revision" BEFORE UPDATE ON "current_rulebooks" FOR EACH ROW EXECUTE FUNCTION "safepoint_next_revision"();
--> statement-breakpoint
CREATE TRIGGER "current_profiles_next_revision" BEFORE UPDATE ON "current_profiles" FOR EACH ROW EXECUTE FUNCTION "safepoint_next_revision"();
--> statement-breakpoint

-- A write to the output: what was written never changes, it is never
-- removed, and its status moves only forward (server/storage/applications.ts).
CREATE FUNCTION "safepoint_application_moves_forward"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'applications rows are never removed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW.id, NEW.process, NEW.read_id, NEW.fingerprint, NEW.proposal_id,
      NEW.resource, NEW.range, NEW.written_at, NEW.adds_resource)
     IS DISTINCT FROM
     (OLD.id, OLD.process, OLD.read_id, OLD.fingerprint, OLD.proposal_id,
      OLD.resource, OLD.range, OLD.written_at, OLD.adds_resource)
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
--> statement-breakpoint
CREATE TRIGGER "applications_move_forward" BEFORE UPDATE OR DELETE ON "applications" FOR EACH ROW EXECUTE FUNCTION "safepoint_application_moves_forward"();
