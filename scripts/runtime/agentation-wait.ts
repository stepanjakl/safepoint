/*
  `pnpm agentation:wait`: blocks until someone presses Send Annotations in the
  development toolbar, prints the batch's pending annotations, and exits 0.
  An agent runs it in the background and is woken when it exits; it then
  acknowledges and resolves each annotation through the agentation MCP tools.
  Exit 2 when the Agentation server (started by `pnpm dev`) cannot be reached.
*/
export {};

const SERVER = 'http://localhost:4747';

type Annotation = {
  id: string;
  comment: string;
  element: string;
  sourceFile?: string;
  selectedText?: string | null;
  url?: string;
  kind?: string;
};

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const response = await fetch(`${SERVER}/events?agent=true`, {
  headers: { Accept: 'text/event-stream' },
}).catch((error: unknown) => {
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? cause.code
      : undefined;
  if (code === 'EPERM' || code === 'EACCES')
    fail(
      `Access to ${SERVER} was denied (${code}). Retry the listener with permission to connect to the local server.`,
    );
  if (code === 'ECONNREFUSED')
    fail(`No Agentation server answered at ${SERVER}. Start it with pnpm dev.`);
  fail(
    `Could not connect to the Agentation server at ${SERVER}: ${String(error)}`,
  );
});
if (!response.ok || !response.body)
  fail(`The Agentation server answered ${response.status}.`);

console.error('Waiting for Send Annotations in the development toolbar…');

const decoder = new TextDecoder();
let buffer = '';
let sessionId: string | undefined;
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true });
  const frames = buffer.split('\n\n');
  buffer = frames.pop() ?? '';
  for (const frame of frames) {
    if (!frame.includes('event: action.requested')) continue;
    const data = frame.split('\n').find((line) => line.startsWith('data: '));
    sessionId = data
      ? (JSON.parse(data.slice(6)) as { sessionId: string }).sessionId
      : undefined;
    if (sessionId) break;
  }
  if (sessionId) break;
}
if (!sessionId) fail('The Agentation server closed the connection.');

const pending = (await (
  await fetch(`${SERVER}/sessions/${sessionId}/pending`)
).json()) as {
  annotations: Annotation[];
};

console.log(
  `${pending.annotations.length} annotation(s) sent from session ${sessionId}:\n`,
);
for (const a of pending.annotations) {
  console.log(
    `- id: ${a.id}${a.kind && a.kind !== 'feedback' ? ` (${a.kind})` : ''}`,
  );
  console.log(`  comment: ${a.comment}`);
  if (a.selectedText) console.log(`  selected text: ${a.selectedText}`);
  console.log(`  element: ${a.element}`);
  if (a.sourceFile) console.log(`  source: ${a.sourceFile}`);
  if (a.url) console.log(`  page: ${a.url}`);
}
process.exit(0);
