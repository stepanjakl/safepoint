CREATE TABLE "answer_parts" (
	"process" text NOT NULL,
	"kind" text NOT NULL,
	"read_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"body" json NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_parts_process_kind_read_id_fingerprint_pk" PRIMARY KEY("process","kind","read_id","fingerprint"),
	CONSTRAINT "answer_parts_kind" CHECK ("answer_parts"."kind" in ('proposal', 'cross-check'))
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "applications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"process" text NOT NULL,
	"read_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"proposal_id" bigint NOT NULL,
	"run_id" text,
	"status" text NOT NULL,
	"resource" text NOT NULL,
	"range" text NOT NULL,
	"written_at" timestamp with time zone NOT NULL,
	"error" text,
	"undone_at" timestamp with time zone,
	"undo_started_at" timestamp with time zone,
	"adds_resource" boolean,
	"before" json NOT NULL,
	"after" json NOT NULL,
	"changes" json NOT NULL,
	"decisions" json NOT NULL,
	"actor" text,
	CONSTRAINT "applications_scoped" UNIQUE("process","id"),
	CONSTRAINT "applications_status" CHECK ("applications"."status" in ('pending', 'verified', 'mismatch', 'failed', 'undone')),
	CONSTRAINT "applications_undone" CHECK (("applications"."status" = 'undone') = ("applications"."undone_at" is not null)),
	CONSTRAINT "applications_undo_started" CHECK ("applications"."undo_started_at" is null or "applications"."status" in ('verified', 'mismatch', 'undone'))
);
--> statement-breakpoint
CREATE TABLE "cross_checks" (
	"process" text NOT NULL,
	"read_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"model" text NOT NULL,
	"agreed" integer NOT NULL,
	"total" integer NOT NULL,
	"body" json NOT NULL,
	CONSTRAINT "cross_checks_process_read_id_fingerprint_pk" PRIMARY KEY("process","read_id","fingerprint"),
	CONSTRAINT "cross_checks_counts" CHECK (0 <= "cross_checks"."agreed" and "cross_checks"."agreed" <= "cross_checks"."total")
);
--> statement-breakpoint
CREATE TABLE "current_profiles" (
	"process" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"body" json NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "current_profiles_id_shape" CHECK ("current_profiles"."profile_id" ~ '^[0-9a-f]{12}$'),
	CONSTRAINT "current_profiles_body_id" CHECK ("current_profiles"."profile_id" is not distinct from ("current_profiles"."body" ->> 'id'))
);
--> statement-breakpoint
CREATE TABLE "current_rulebooks" (
	"process" text NOT NULL,
	"instructions_hash" text NOT NULL,
	"body" json NOT NULL,
	"schema_version" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "current_rulebooks_process_instructions_hash_pk" PRIMARY KEY("process","instructions_hash"),
	CONSTRAINT "current_rulebooks_body_hash" CHECK ("current_rulebooks"."instructions_hash" is not distinct from ("current_rulebooks"."body" ->> 'hash'))
);
--> statement-breakpoint
CREATE TABLE "data_profiles" (
	"process" text NOT NULL,
	"id" text NOT NULL,
	"read_id" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"confirmed_by" text,
	"body" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_profiles_process_id_pk" PRIMARY KEY("process","id"),
	CONSTRAINT "data_profiles_id_shape" CHECK ("data_profiles"."id" ~ '^[0-9a-f]{12}$'),
	CONSTRAINT "data_profiles_body_id" CHECK ("data_profiles"."id" is not distinct from ("data_profiles"."body" ->> 'id')),
	CONSTRAINT "data_profiles_body_read" CHECK ("data_profiles"."read_id" is not distinct from ("data_profiles"."body" ->> 'readId'))
);
--> statement-breakpoint
CREATE TABLE "instruction_versions" (
	"process" text NOT NULL,
	"hash" text NOT NULL,
	"version" text NOT NULL,
	"text" text NOT NULL,
	"note" text,
	"origin" text NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruction_versions_process_hash_pk" PRIMARY KEY("process","hash"),
	CONSTRAINT "instruction_versions_version" UNIQUE("process","version"),
	CONSTRAINT "instruction_versions_origin" CHECK ("instruction_versions"."origin" in ('declared', 'published')),
	CONSTRAINT "instruction_versions_hash_is_text" CHECK ("instruction_versions"."hash" = left(encode(sha256(convert_to("instruction_versions"."text", 'UTF8')), 'hex'), 12))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"process" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"step" text NOT NULL,
	"running" boolean NOT NULL,
	"error" text,
	"writing" text,
	"activity" json,
	"holder" text,
	"heartbeat_at" timestamp with time zone,
	"started_by" text,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_process_kind_key_pk" PRIMARY KEY("process","kind","key"),
	CONSTRAINT "jobs_kind" CHECK ("jobs"."kind" in ('drafts', 'proposals')),
	CONSTRAINT "jobs_held" CHECK (not "jobs"."running" or ("jobs"."holder" is not null and "jobs"."heartbeat_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "model_attempts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "model_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"process" text NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"job_kind" text,
	"job_key" text,
	"run_id" text,
	"instructions_hash" text,
	"read_id" text,
	"fingerprint" text,
	"definition_id" text,
	"attempt" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer,
	"outcome" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"thinking_tokens" integer,
	"asked" json NOT NULL,
	"answer" json,
	"error" text,
	CONSTRAINT "model_attempts_purpose" CHECK ("model_attempts"."purpose" in ('find', 'write', 'cross-check', 'propose', 'advise')),
	CONSTRAINT "model_attempts_outcome" CHECK ("model_attempts"."outcome" in ('answered', 'refused', 'quota', 'busy', 'failed')),
	CONSTRAINT "model_attempts_attempt" CHECK ("model_attempts"."attempt" >= 1)
);
--> statement-breakpoint
CREATE TABLE "model_limits" (
	"model" text PRIMARY KEY NOT NULL,
	"shares_with" text,
	"per_minute" integer,
	"per_minute_learned_at" timestamp with time zone,
	"per_day" integer,
	"per_day_learned_at" timestamp with time zone,
	"used_day" date,
	"used_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_limits_per_minute" CHECK (("model_limits"."per_minute" is null) = ("model_limits"."per_minute_learned_at" is null) and ("model_limits"."per_minute" is null or "model_limits"."per_minute" > 0)),
	CONSTRAINT "model_limits_per_day" CHECK (("model_limits"."per_day" is null) = ("model_limits"."per_day_learned_at" is null) and ("model_limits"."per_day" is null or "model_limits"."per_day" > 0)),
	CONSTRAINT "model_limits_used" CHECK ("model_limits"."used_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "processes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processes_id_shape" CHECK ("processes"."id" ~ '^[a-z0-9][a-z0-9-]*$')
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "proposals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"process" text NOT NULL,
	"read_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"proposed_at" timestamp with time zone NOT NULL,
	"model" text NOT NULL,
	"body" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_scoped" UNIQUE("process","id"),
	CONSTRAINT "proposals_by_run_key" UNIQUE("process","read_id","fingerprint","proposed_at"),
	CONSTRAINT "proposals_fingerprint_shape" CHECK ("proposals"."fingerprint" ~ '^[0-9a-f]{12}$'),
	CONSTRAINT "proposals_body_run_key" CHECK ("proposals"."fingerprint" is not distinct from ("proposals"."body" ->> 'fingerprint') and "proposals"."read_id" is not distinct from ("proposals"."body" ->> 'readId'))
);
--> statement-breakpoint
CREATE TABLE "reads" (
	"process" text NOT NULL,
	"id" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"body" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reads_process_id_pk" PRIMARY KEY("process","id"),
	CONSTRAINT "reads_id_shape" CHECK ("reads"."id" ~ '^[A-Za-z0-9_-]{1,80}$'),
	CONSTRAINT "reads_body_id" CHECK ("reads"."id" is not distinct from ("reads"."body" ->> 'id'))
);
--> statement-breakpoint
CREATE TABLE "record_decisions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "record_decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"process" text NOT NULL,
	"run_id" text NOT NULL,
	"proposal_id" bigint NOT NULL,
	"record_key" text NOT NULL,
	"kind" text NOT NULL,
	"values" json,
	"verdict" text,
	"checks" json,
	"actor" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_decisions_kind" CHECK ("record_decisions"."kind" in ('approve', 'change', 'reject', 'withdraw')),
	CONSTRAINT "record_decisions_verdict" CHECK ("record_decisions"."verdict" is null or "record_decisions"."verdict" in ('ready', 'decide', 'blocked', 'unchecked')),
	CONSTRAINT "record_decisions_values" CHECK (("record_decisions"."kind" = 'change') = ("record_decisions"."values" is not null))
);
--> statement-breakpoint
CREATE TABLE "rule_decisions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rule_decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"process" text NOT NULL,
	"instructions_hash" text,
	"kind" text NOT NULL,
	"definition_id" text,
	"definition" json,
	"rulebook_revision" integer,
	"note" text,
	"version_index" integer,
	"applies_to" text,
	"profile_id" text,
	"refusal" text,
	"actor" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_decisions_kind" CHECK ("rule_decisions"."kind" in ('confirm_intent', 'accept', 'deny', 'choose', 'applies_to', 'confirm_profile')),
	CONSTRAINT "rule_decisions_definition" CHECK (("rule_decisions"."kind" in ('accept', 'deny', 'choose', 'applies_to')) = ("rule_decisions"."definition_id" is not null and "rule_decisions"."definition" is not null and "rule_decisions"."rulebook_revision" is not null)),
	CONSTRAINT "rule_decisions_instructions" CHECK (("rule_decisions"."kind" = 'confirm_profile') = ("rule_decisions"."instructions_hash" is null)),
	CONSTRAINT "rule_decisions_profile" CHECK (("rule_decisions"."kind" = 'confirm_profile') = ("rule_decisions"."profile_id" is not null)),
	CONSTRAINT "rule_decisions_choice" CHECK (("rule_decisions"."kind" = 'choose') = ("rule_decisions"."version_index" is not null)),
	CONSTRAINT "rule_decisions_applies_to" CHECK (("rule_decisions"."kind" = 'applies_to') = ("rule_decisions"."applies_to" is not null) and ("rule_decisions"."applies_to" is null or "rule_decisions"."applies_to" in ('every', 'some')))
);
--> statement-breakpoint
CREATE TABLE "rulebook_heads" (
	"process" text NOT NULL,
	"instructions_hash" text NOT NULL,
	"revision_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rulebook_heads_process_instructions_hash_pk" PRIMARY KEY("process","instructions_hash")
);
--> statement-breakpoint
CREATE TABLE "rulebook_revisions" (
	"process" text NOT NULL,
	"instructions_hash" text NOT NULL,
	"id" text NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "rulebook_revisions_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"parent" text,
	"reason" text NOT NULL,
	"revised_at" timestamp with time zone NOT NULL,
	"schema_version" integer NOT NULL,
	"note" text,
	"profile_id" text,
	"actor" text,
	"body" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rulebook_revisions_process_instructions_hash_id_pk" PRIMARY KEY("process","instructions_hash","id"),
	CONSTRAINT "rulebook_revisions_seq" UNIQUE("seq"),
	CONSTRAINT "rulebook_revisions_id_shape" CHECK ("rulebook_revisions"."id" ~ '^[0-9a-f]{12}$'),
	CONSTRAINT "rulebook_revisions_body_hash" CHECK ("rulebook_revisions"."instructions_hash" is not distinct from ("rulebook_revisions"."body" ->> 'hash')),
	CONSTRAINT "rulebook_revisions_body_profile" CHECK ("rulebook_revisions"."profile_id" is not distinct from ("rulebook_revisions"."body" ->> 'profileId')),
	CONSTRAINT "rulebook_revisions_reason" CHECK ("rulebook_revisions"."reason" in ('accepted', 'migrated', 'used'))
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"process" text NOT NULL,
	"id" text NOT NULL,
	"instructions_hash" text NOT NULL,
	"read_id" text,
	"rulebook_id" text,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"trigger" text NOT NULL,
	"additional_instructions" text,
	"started_by" text,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_process_id_pk" PRIMARY KEY("process","id"),
	CONSTRAINT "runs_stage" CHECK ("runs"."stage" in ('instructions', 'read', 'rules', 'calculate', 'propose', 'apply')),
	CONSTRAINT "runs_status" CHECK ("runs"."status" in ('queued', 'running', 'awaiting_review', 'approved', 'completed', 'held', 'failed', 'superseded', 'cancelled')),
	CONSTRAINT "runs_trigger" CHECK ("runs"."trigger" in ('schedule', 'manual', 'rerun'))
);
--> statement-breakpoint
CREATE TABLE "source_reads" (
	"source" text NOT NULL,
	"read_id" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"body" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_reads_source_read_id_pk" PRIMARY KEY("source","read_id"),
	CONSTRAINT "source_reads_id_shape" CHECK ("source_reads"."read_id" ~ '^[A-Za-z0-9_-]{1,80}$'),
	CONSTRAINT "source_reads_not_captured" CHECK ("source_reads"."read_id" <> 'captured')
);
--> statement-breakpoint
ALTER TABLE "answer_parts" ADD CONSTRAINT "answer_parts_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_parts" ADD CONSTRAINT "answer_parts_read_fk" FOREIGN KEY ("process","read_id") REFERENCES "public"."reads"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_proposal_fk" FOREIGN KEY ("process","proposal_id") REFERENCES "public"."proposals"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_read_fk" FOREIGN KEY ("process","read_id") REFERENCES "public"."reads"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_run_fk" FOREIGN KEY ("process","run_id") REFERENCES "public"."runs"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_checks" ADD CONSTRAINT "cross_checks_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_checks" ADD CONSTRAINT "cross_checks_read_fk" FOREIGN KEY ("process","read_id") REFERENCES "public"."reads"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_profiles" ADD CONSTRAINT "current_profiles_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_rulebooks" ADD CONSTRAINT "current_rulebooks_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_rulebooks" ADD CONSTRAINT "current_rulebooks_instructions_fk" FOREIGN KEY ("process","instructions_hash") REFERENCES "public"."instruction_versions"("process","hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_profiles" ADD CONSTRAINT "data_profiles_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruction_versions" ADD CONSTRAINT "instruction_versions_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_attempts" ADD CONSTRAINT "model_attempts_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_read_fk" FOREIGN KEY ("process","read_id") REFERENCES "public"."reads"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reads" ADD CONSTRAINT "reads_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_decisions" ADD CONSTRAINT "record_decisions_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_decisions" ADD CONSTRAINT "record_decisions_run_fk" FOREIGN KEY ("process","run_id") REFERENCES "public"."runs"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_decisions" ADD CONSTRAINT "record_decisions_proposal_fk" FOREIGN KEY ("process","proposal_id") REFERENCES "public"."proposals"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_decisions" ADD CONSTRAINT "rule_decisions_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_decisions" ADD CONSTRAINT "rule_decisions_instructions_fk" FOREIGN KEY ("process","instructions_hash") REFERENCES "public"."instruction_versions"("process","hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_decisions" ADD CONSTRAINT "rule_decisions_profile_fk" FOREIGN KEY ("process","profile_id") REFERENCES "public"."data_profiles"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulebook_heads" ADD CONSTRAINT "rulebook_heads_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulebook_heads" ADD CONSTRAINT "rulebook_heads_revision_fk" FOREIGN KEY ("process","instructions_hash","revision_id") REFERENCES "public"."rulebook_revisions"("process","instructions_hash","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulebook_revisions" ADD CONSTRAINT "rulebook_revisions_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulebook_revisions" ADD CONSTRAINT "rulebook_revisions_instructions_fk" FOREIGN KEY ("process","instructions_hash") REFERENCES "public"."instruction_versions"("process","hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulebook_revisions" ADD CONSTRAINT "rulebook_revisions_parent_fk" FOREIGN KEY ("process","instructions_hash","parent") REFERENCES "public"."rulebook_revisions"("process","instructions_hash","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulebook_revisions" ADD CONSTRAINT "rulebook_revisions_profile_fk" FOREIGN KEY ("process","profile_id") REFERENCES "public"."data_profiles"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_process_processes_id_fk" FOREIGN KEY ("process") REFERENCES "public"."processes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_instructions_fk" FOREIGN KEY ("process","instructions_hash") REFERENCES "public"."instruction_versions"("process","hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_read_fk" FOREIGN KEY ("process","read_id") REFERENCES "public"."reads"("process","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_rulebook_fk" FOREIGN KEY ("process","instructions_hash","rulebook_id") REFERENCES "public"."rulebook_revisions"("process","instructions_hash","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_one_standing" ON "applications" USING btree ("process","read_id","fingerprint") WHERE "applications"."status" in ('pending', 'verified', 'mismatch');--> statement-breakpoint
CREATE INDEX "applications_by_run_key" ON "applications" USING btree ("process","read_id","fingerprint","id");--> statement-breakpoint
CREATE INDEX "applications_by_time" ON "applications" USING btree ("process","written_at");--> statement-breakpoint
CREATE INDEX "jobs_running" ON "jobs" USING btree ("heartbeat_at") WHERE "jobs"."running";--> statement-breakpoint
CREATE INDEX "model_attempts_by_time" ON "model_attempts" USING btree ("process","started_at");--> statement-breakpoint
CREATE INDEX "model_attempts_by_job" ON "model_attempts" USING btree ("process","job_kind","job_key","id");--> statement-breakpoint
CREATE INDEX "model_attempts_by_run" ON "model_attempts" USING btree ("process","run_id","id");--> statement-breakpoint
CREATE INDEX "record_decisions_by_proposal" ON "record_decisions" USING btree ("process","run_id","proposal_id","record_key","id");--> statement-breakpoint
CREATE INDEX "rule_decisions_by_instructions" ON "rule_decisions" USING btree ("process","instructions_hash","id");--> statement-breakpoint
CREATE INDEX "rulebook_revisions_by_instructions" ON "rulebook_revisions" USING btree ("process","instructions_hash","seq");--> statement-breakpoint
CREATE INDEX "runs_by_start" ON "runs" USING btree ("process","started_at");