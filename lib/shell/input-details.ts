import type { IconKey } from './system-links';

/*
  What an input actually gave this run: the records its JSON file holds, with
  the facts a reviewer checks pulled out and the items that cited each one.

  One detail per file. The files are analysed extracts, treated as the run's
  source of truth and produced outside Safepoint; the source labels their
  records carry are kept as provenance, so a file whose records name two
  sources is still one input.
*/

export type InputField = { label: string; value: string };

export type InputRecordDetail = {
  evidenceId: string;
  title: string;
  // The item or items the record is about; null for a record about the whole run.
  subject: string | null;
  unavailableReason: string | null;
  fields: InputField[];
  // Free text from the file. Notes are untrusted evidence: shown, never
  // treated as instruction.
  text: string | null;
  untrusted: boolean;
  // The record exactly as the file holds it.
  raw: string;
  citedBy: { sku: string; label: string }[];
};

export type InputDetail = {
  id: string;
  label: string;
  icon: IconKey;
  file: string;
  observedAtLabel: string;
  // For an input whose currency is a version rather than an observation time.
  version: string | null;
  // The source labels the file's records carry, as provenance.
  sources: string[];
  records: InputRecordDetail[];
  unavailableCount: number;
  citedByCount: number;
  checks: string[];
};
