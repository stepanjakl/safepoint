import 'server-only';

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { APICallError } from 'ai';

/*
  Development only: Claude, asked through the Claude Code CLI on this
  machine (`claude -p`), as a model the engine can draft with, so a run can
  compare it with the others without an API key. Each call is a new session
  in an empty folder, with no tools, no settings, hooks or MCP servers of
  this machine, and nothing saved: it sees only what the engine sends, as
  any other model does.

  The engine asks in one of three ways, and each is put to the CLI as JSON
  it must fill (`--json-schema`): an answer to a schema (finding); a call to
  one of the tools it is given (writing and proposing, which require one on
  every step), as `{ tool, input }`; or plain text. The conversation so far
  (earlier calls and what each tool answered) is written out in full, since
  no session is kept between calls.

  It draws on the Claude plan the CLI is signed in to, so it is for local
  trials, never for the app's users.
*/

type Json = Record<string, unknown>;
type Part = { type: string; [key: string]: unknown };
type Message = { role: string; content: string | Part[] };
type FunctionTool = {
  type: 'function';
  name: string;
  description?: string;
  inputSchema: Json;
};
type CallOptions = {
  prompt: Message[];
  responseFormat?: { type: 'text' } | { type: 'json'; schema?: Json };
  tools?: (FunctionTool | { type: string; name: string })[];
  toolChoice?:
    { type: 'auto' | 'none' | 'required' } | { type: 'tool'; toolName: string };
  abortSignal?: AbortSignal;
};

const CLI = process.env.SAFEPOINT_CLAUDE_CLI || 'claude';
const URL = 'claude-cli://local';

const asText = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value);

// What a tool answered, as the engine gave it.
function resultText(output: unknown): string {
  const o = output as { type?: string; value?: unknown } | undefined;
  return o && 'value' in o ? asText(o.value) : asText(output);
}

// The conversation after the system prompt, written out for a new session.
function transcript(messages: Message[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const parts =
      typeof message.content === 'string'
        ? [{ type: 'text', text: message.content }]
        : message.content;
    for (const part of parts) {
      if (part.type === 'text' && message.role === 'user')
        lines.push(String(part.text));
      else if (part.type === 'text' && message.role === 'assistant')
        lines.push(`[You said]\n${part.text}`);
      else if (part.type === 'tool-call')
        lines.push(`[You called ${part.toolName} with]\n${asText(part.input)}`);
      else if (part.type === 'tool-result')
        lines.push(`[${part.toolName} answered]\n${resultText(part.output)}`);
    }
  }
  return lines.join('\n\n');
}

type Ask =
  | { kind: 'json'; schema: Json }
  | { kind: 'tool'; schema: Json; tools: FunctionTool[] }
  | { kind: 'text' };

// How this call is to be answered, from what the engine asked for.
function askOf(options: CallOptions): Ask {
  const tools = (options.tools ?? []).filter(
    (t): t is FunctionTool => t.type === 'function',
  );
  const choice = options.toolChoice;
  if (tools.length && choice?.type !== 'none') {
    const allowed =
      choice?.type === 'tool'
        ? tools.filter((t) => t.name === choice.toolName)
        : tools;
    const call = (t: FunctionTool) => ({
      type: 'object',
      properties: { tool: { const: t.name }, input: t.inputSchema },
      required: ['tool', 'input'],
      additionalProperties: false,
    });
    return {
      kind: 'tool',
      tools: allowed,
      schema:
        // The CLI's schema must be an object at its top: a choice of
        // calls is one property of it.
        {
          type: 'object',
          properties: { call: { anyOf: allowed.map(call) } },
          required: ['call'],
          additionalProperties: false,
        },
    };
  }
  if (options.responseFormat?.type === 'json' && options.responseFormat.schema)
    return { kind: 'json', schema: options.responseFormat.schema };
  return { kind: 'text' };
}

function toolsText(tools: FunctionTool[]): string {
  return [
    'Answer by calling exactly one of these tools, as { "tool": <name>, "input": <its input> }. What it answers comes back to you in the next turn.',
    ...tools.map(
      (t) =>
        `- ${t.name}: ${t.description ?? ''}\n  input schema: ${JSON.stringify(t.inputSchema)}`,
    ),
  ].join('\n');
}

type CliResult = {
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number };
  modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number }>;
  api_error_status?: number | null;
};

// One call of the CLI: the prompt on its standard input, its JSON answer out.
async function runCli(
  args: string[],
  prompt: string,
  signal: AbortSignal | undefined,
): Promise<CliResult> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'safepoint-claude-'));
  try {
    return await new Promise<CliResult>((resolve, reject) => {
      const child = spawn(CLI, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'safepoint-trial' },
      });
      let out = '';
      let err = '';
      const abort = () => child.kill('SIGTERM');
      signal?.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk) => (out += chunk));
      child.stderr.on('data', (chunk) => (err += chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        signal?.removeEventListener('abort', abort);
        if (signal?.aborted)
          return reject(signal.reason ?? new Error('Aborted.'));
        try {
          resolve(JSON.parse(out) as CliResult);
        } catch {
          reject(
            new APICallError({
              message: `The Claude CLI answered no JSON (exit ${code}): ${(err || out).slice(0, 300)}`,
              url: URL,
              requestBodyValues: {},
              isRetryable: false,
            }),
          );
        }
      });
      child.stdin.end(prompt);
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function generate(modelId: string, options: CallOptions) {
  const system = options.prompt
    .filter((m) => m.role === 'system')
    .map((m) => String(m.content))
    .join('\n\n');
  const ask = askOf(options);
  const prompt = [
    transcript(options.prompt.filter((m) => m.role !== 'system')),
    ...(ask.kind === 'tool' ? [toolsText(ask.tools)] : []),
  ].join('\n\n');
  const args = [
    '-p',
    '--model',
    modelId,
    '--output-format',
    'json',
    '--system-prompt',
    system || 'Answer as asked.',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--settings',
    JSON.stringify({ disableAllHooks: true }),
    '--no-session-persistence',
    '--disable-slash-commands',
    ...(ask.kind === 'text'
      ? []
      : ['--json-schema', JSON.stringify(ask.schema)]),
  ];
  const answer = await runCli(args, prompt, options.abortSignal);
  if (answer.is_error)
    throw new APICallError({
      message: answer.result || 'The Claude CLI failed.',
      url: URL,
      requestBodyValues: {},
      statusCode: answer.api_error_status ?? undefined,
      isRetryable: true,
    });
  const used = Object.entries(answer.modelUsage ?? {}).find(([name]) =>
    name.includes(modelId),
  )?.[1];
  const usage = {
    inputTokens: {
      total: used?.inputTokens ?? answer.usage?.input_tokens,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: used?.outputTokens ?? answer.usage?.output_tokens,
      text: undefined,
      reasoning: undefined,
    },
  };
  const output = answer.structured_output as Json | undefined;
  const structured =
    ask.kind === 'tool' ? (output?.call as Json | undefined) : output;
  const content =
    ask.kind === 'tool' && structured
      ? [
          {
            type: 'tool-call' as const,
            toolCallId: `call-${crypto.randomUUID()}`,
            toolName: String(structured.tool),
            input: JSON.stringify(structured.input ?? {}),
          },
        ]
      : [
          {
            type: 'text' as const,
            text:
              ask.kind === 'json' && structured !== undefined
                ? JSON.stringify(structured)
                : (answer.result ?? ''),
          },
        ];
  return {
    content,
    finishReason: {
      unified: content[0]!.type === 'tool-call' ? 'tool-calls' : 'stop',
      raw: undefined,
    },
    usage,
    warnings: [],
  };
}

// A language model, in the shape the AI SDK calls (LanguageModelV4).
export function claudeCli(modelId = 'opus') {
  return {
    specificationVersion: 'v4' as const,
    provider: 'claude-cli',
    modelId,
    supportedUrls: {},
    doGenerate: (options: CallOptions) => generate(modelId, options),
    async doStream(options: CallOptions) {
      const result = await generate(modelId, options);
      const parts: Json[] = [{ type: 'stream-start', warnings: [] }];
      for (const part of result.content) {
        if (part.type === 'text') {
          parts.push({ type: 'text-start', id: 't' });
          parts.push({ type: 'text-delta', id: 't', delta: part.text });
          parts.push({ type: 'text-end', id: 't' });
        } else parts.push(part);
      }
      parts.push({
        type: 'finish',
        usage: result.usage,
        finishReason: result.finishReason,
      });
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  };
}
