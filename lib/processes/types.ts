/*
  What a process declares for the data its runs read, in a shape no process
  owns. The server keeps a run's read under `process`, reads the source's
  `tabs` into it, and falls back to the `captured` copy where there is no
  network (server/storage/run-reads.ts).
*/
export type RunReads = {
  // The process whose `reads` rows a run's read is kept under.
  process: string;
  // The source the data is read from (lib/sources), and the tabs a run keeps
  // of it, in the order they are shown.
  source: string;
  tabs: string[];
  // A read saved in the repository, relative to its root.
  captured: string;
};
