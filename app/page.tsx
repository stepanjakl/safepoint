const documentationUrl =
  'https://github.com/stepanjakl/safepoint/blob/main/docs/README.md';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Safepoint
      </h1>
      <p className="text-base leading-relaxed text-neutral-700 sm:text-lg">
        Safepoint helps people review changes proposed by an AI agent before
        those changes reach real systems. Instead of approving a chat message, a
        reviewer sees a clear change set: what the agent inspected, what it
        wants to change, what it left out, what looks risky, and what happened
        after approval.
      </p>
      <p className="text-base">
        <a
          className="rounded-sm font-medium text-blue-700 underline underline-offset-4 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          href={documentationUrl}
        >
          Read the project documentation
        </a>
      </p>
    </main>
  );
}
