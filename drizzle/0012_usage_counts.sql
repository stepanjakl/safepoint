CREATE TABLE "usage_counts" (
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counts_kind_subject_day_pk" PRIMARY KEY("kind","subject","day"),
	CONSTRAINT "usage_counts_kind" CHECK ("usage_counts"."kind" in ('runs', 'model', 'reads', 'writes')),
	CONSTRAINT "usage_counts_count" CHECK ("usage_counts"."count" >= 0)
);
