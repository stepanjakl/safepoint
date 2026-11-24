import { Composio } from '@composio/core';
import { z } from 'zod';

/*
  Server-only. Reads a Google Sheet through Composio and records exactly what
  was asked and what came back, so the page can show it; writes to one tab of
  it only when an approved proposal asks to (writeRange). The API key never
  leaves this module; the request record carries everything else.

  The toolkit version is pinned: a Composio release cannot change the shape of
  a response underneath us. Bump it deliberately after checking the new shape.
*/
const GOOGLESHEETS_TOOLKIT_VERSION = '20261001_00';

const SHEET_ENV = [
  'COMPOSIO_API_KEY',
  'COMPOSIO_USER_ID',
  'COMPOSIO_GOOGLESHEETS_ACCOUNT_ID',
  'GOOGLE_SHEETS_SPREADSHEET_ID',
] as const;

const valueRangeSchema = z.object({
  range: z.string(),
  values: z.array(z.array(z.unknown())).optional(),
});
const batchGetSchema = z.object({
  spreadsheetId: z.string(),
  valueRanges: z.array(valueRangeSchema),
});
const infoSchema = z.object({
  properties: z
    .object({ title: z.string(), timeZone: z.string(), locale: z.string() })
    .partial()
    .optional(),
  sheets: z
    .array(
      z.object({
        properties: z.object({
          sheetId: z.number(),
          title: z.string(),
          gridProperties: z
            .object({ rowCount: z.number(), columnCount: z.number() })
            .partial()
            .optional(),
        }),
      }),
    )
    .optional(),
});

const sheetRequestSchema = z.object({
  tool: z.string(),
  toolkitVersion: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  durationMs: z.number(),
  successful: z.boolean(),
  error: z.string().nullable(),
});

export type SheetRequestRecord = z.infer<typeof sheetRequestSchema>;

export const sheetReadSchema = z.object({
  readAt: z.string(),
  connection: z.object({ userId: z.string(), connectedAccountId: z.string() }),
  spreadsheet: z.object({
    id: z.string(),
    url: z.string(),
    title: z.string().nullable(),
    timeZone: z.string().nullable(),
    locale: z.string().nullable(),
    tabIds: z.record(z.string(), z.number()),
  }),
  // Every tab, in the sheet's own order, as discovered at read time.
  tabs: z.array(z.string()),
  requests: z.array(sheetRequestSchema),
  valueRanges: z.array(valueRangeSchema),
});

export type SheetRead = z.infer<typeof sheetReadSchema>;

function columnLetters(count: number) {
  let letters = '';
  for (let n = count; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

// The tab's whole grid, as large as the sheet says it is, so nothing past a
// fixed edge is dropped. Quoted so a tab named like a cell ("Kit") is a tab.
const wholeTabRange = (
  tab: string,
  grid: { rowCount?: number; columnCount?: number } | undefined,
) =>
  `'${tab.replaceAll("'", "''")}'!A1:${columnLetters(Math.max(1, grid?.columnCount ?? 26))}${Math.max(1, grid?.rowCount ?? 1000)}`;

// The tab a returned range belongs to, unquoted: `'Kit''s'!A1:Z9` is Kit's.
const rangeTab = (range: string) =>
  range
    .slice(0, range.lastIndexOf('!'))
    .replace(/^'(.*)'$/, '$1')
    .replaceAll("''", "'");

// One tab's cells as a read returned them; empty for a tab it did not return.
export function tabValues(read: SheetRead, tab: string): unknown[][] {
  return (
    read.valueRanges.find((range) => rangeTab(range.range) === tab)?.values ??
    []
  );
}

export function missingSheetEnv(): string[] {
  return SHEET_ENV.filter((name) => !process.env[name]);
}

// A connection to the configured sheet: calls a tool, recording what happened.
function connect() {
  const missing = missingSheetEnv();
  if (missing.length)
    throw new Error(`Missing environment variables: ${missing.join(', ')}.`);
  const env = Object.fromEntries(
    SHEET_ENV.map((name) => [name, process.env[name]!]),
  ) as Record<(typeof SHEET_ENV)[number], string>;
  const composio = new Composio({
    apiKey: env.COMPOSIO_API_KEY,
    toolkitVersions: { googlesheets: GOOGLESHEETS_TOOLKIT_VERSION },
  });
  const call = async (tool: string, args: Record<string, unknown>) => {
    const started = performance.now();
    try {
      const result = await composio.tools.execute(tool, {
        userId: env.COMPOSIO_USER_ID,
        connectedAccountId: env.COMPOSIO_GOOGLESHEETS_ACCOUNT_ID,
        arguments: args,
      });
      return {
        record: {
          tool,
          toolkitVersion: GOOGLESHEETS_TOOLKIT_VERSION,
          arguments: args,
          durationMs: Math.round(performance.now() - started),
          successful: result.successful,
          error: result.successful
            ? null
            : redact(errorText(result.error), env.COMPOSIO_API_KEY),
        },
        data: result.data as unknown,
      };
    } catch (error) {
      return {
        record: {
          tool,
          toolkitVersion: GOOGLESHEETS_TOOLKIT_VERSION,
          arguments: args,
          durationMs: Math.round(performance.now() - started),
          successful: false,
          error: redact(
            error instanceof Error ? error.message : String(error),
            env.COMPOSIO_API_KEY,
          ),
        },
        data: null,
      };
    }
  };
  return { env, call };
}

const INFO_FIELDS =
  'properties.title,properties.timeZone,properties.locale,sheets.properties.sheetId,sheets.properties.title,sheets.properties.gridProperties';

/*
  Reads every tab: first asks the sheet which tabs it has, then fetches them
  all in one request. Nothing about the process is assumed here.
*/
export async function readWholeSheet(): Promise<SheetRead> {
  const { env, call } = connect();
  const readAt = new Date().toISOString();
  const info = await call('GOOGLESHEETS_GET_SPREADSHEET_INFO', {
    spreadsheet_id: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    fields: INFO_FIELDS,
  });
  const parsedInfo = infoSchema.safeParse(info.data);
  const sheets = parsedInfo.success ? (parsedInfo.data.sheets ?? []) : [];
  const tabs = sheets.map(({ properties }) => properties.title);
  const values = tabs.length
    ? await call('GOOGLESHEETS_BATCH_GET', {
        spreadsheet_id: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        ranges: sheets.map(({ properties }) =>
          wholeTabRange(properties.title, properties.gridProperties),
        ),
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
      })
    : {
        record: {
          tool: 'GOOGLESHEETS_BATCH_GET',
          toolkitVersion: GOOGLESHEETS_TOOLKIT_VERSION,
          arguments: {},
          durationMs: 0,
          successful: false,
          error: 'Not sent: no tabs were discovered.',
        },
        data: null,
      };

  const parsedValues = batchGetSchema.safeParse(values.data);
  if (values.record.successful && !parsedValues.success)
    values.record = {
      ...values.record,
      successful: false,
      error: 'Response did not have the expected shape (valueRanges).',
    };

  return {
    readAt,
    connection: {
      userId: env.COMPOSIO_USER_ID,
      connectedAccountId: env.COMPOSIO_GOOGLESHEETS_ACCOUNT_ID,
    },
    spreadsheet: {
      id: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      url: `https://docs.google.com/spreadsheets/d/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/edit`,
      title: parsedInfo.success
        ? (parsedInfo.data.properties?.title ?? null)
        : null,
      timeZone: parsedInfo.success
        ? (parsedInfo.data.properties?.timeZone ?? null)
        : null,
      locale: parsedInfo.success
        ? (parsedInfo.data.properties?.locale ?? null)
        : null,
      tabIds: Object.fromEntries(
        (parsedInfo.success ? (parsedInfo.data.sheets ?? []) : []).map(
          ({ properties }) => [properties.title, properties.sheetId],
        ),
      ),
    },
    tabs,
    requests: [info.record, values.record],
    valueRanges: parsedValues.success ? parsedValues.data.valueRanges : [],
  };
}

/*
  Composio passes the service's error on as its JSON body, printed over many
  lines; a person is told its message, never a line of JSON.
*/
export const READS_SPENT =
  'Google Sheets allows only so many reads a minute, and they are used up for now. Try again in a minute.';

export function errorText(raw: unknown): string {
  const text = String(raw ?? 'Unknown error');
  let message = text;
  try {
    const body = JSON.parse(text) as {
      error?: { message?: unknown; code?: unknown; status?: unknown } | string;
      message?: unknown;
    };
    const error = typeof body.error === 'object' ? body.error : undefined;
    if (error?.code === 429 || error?.status === 'RESOURCE_EXHAUSTED')
      return READS_SPENT;
    const said = error ? error.message : body.message;
    if (typeof said === 'string' && said.trim()) message = said.trim();
  } catch {
    // Not JSON: said as it came.
  }
  // Its per-minute limit, said in Google's words: said in a person's.
  return /quota exceeded .*per minute/i.test(message) ? READS_SPENT : message;
}

// What a call that had to succeed came back with, or why it did not.
function succeeded(result: { record: SheetRequestRecord; data: unknown }) {
  if (!result.record.successful)
    throw new Error(result.record.error ?? `${result.record.tool} failed.`);
  return result.data;
}

// A tab's cells, unformatted as a read's are; null when the sheet has no such
// tab. Whole grid, so nothing past a fixed edge is missed.
export async function readTab(tab: string): Promise<unknown[][] | null> {
  const { env, call } = connect();
  const info = infoSchema.parse(
    succeeded(
      await call('GOOGLESHEETS_GET_SPREADSHEET_INFO', {
        spreadsheet_id: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        fields: INFO_FIELDS,
      }),
    ),
  );
  const sheet = info.sheets?.find(({ properties }) => properties.title === tab);
  if (!sheet) return null;
  const values = batchGetSchema.parse(
    succeeded(
      await call('GOOGLESHEETS_BATCH_GET', {
        spreadsheet_id: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        ranges: [wholeTabRange(tab, sheet.properties.gridProperties)],
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
      }),
    ),
  );
  return values.valueRanges[0]?.values ?? [];
}

// Adds a tab of exactly this name; it fails rather than take another name.
export async function addTab(tab: string): Promise<void> {
  const { env, call } = connect();
  succeeded(
    await call('GOOGLESHEETS_ADD_SHEET', {
      spreadsheet_id: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      title: tab,
      force_unique: false,
    }),
  );
}

// One range in one request, values as they are: an empty string clears a cell.
export async function writeRange(
  tab: string,
  range: string,
  values: unknown[][],
): Promise<void> {
  const { env, call } = connect();
  succeeded(
    await call('GOOGLESHEETS_VALUES_UPDATE', {
      spreadsheet_id: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `'${tab.replaceAll("'", "''")}'!${range}`,
      value_input_option: 'RAW',
      values,
    }),
  );
}

function redact(text: string, key: string) {
  return key ? text.replaceAll(key, '[redacted]') : text;
}
