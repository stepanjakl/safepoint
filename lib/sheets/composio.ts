import { Composio } from '@composio/core';
import { z } from 'zod';

/*
  Server-only. Reads a Google Sheet through Composio and records exactly what
  was asked and what came back, so the page can show it. The API key never
  leaves this module; the request record carries everything else.

  The toolkit version is pinned: a Composio release cannot change the shape of
  a response underneath us. Bump it deliberately after checking the new shape.
*/
export const GOOGLESHEETS_TOOLKIT_VERSION = '20261001_00';

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
        properties: z.object({ sheetId: z.number(), title: z.string() }),
      }),
    )
    .optional(),
});

export type SheetRequestRecord = {
  tool: string;
  toolkitVersion: string;
  arguments: Record<string, unknown>;
  durationMs: number;
  successful: boolean;
  error: string | null;
};

export type SheetRead = {
  readAt: string;
  connection: { userId: string; connectedAccountId: string };
  spreadsheet: {
    id: string;
    url: string;
    title: string | null;
    timeZone: string | null;
    locale: string | null;
    tabIds: Record<string, number>;
  };
  // Every tab, in the sheet's own order, as discovered at read time.
  tabs: string[];
  requests: SheetRequestRecord[];
  valueRanges: z.infer<typeof valueRangeSchema>[];
};

// Quoted so a tab named like a column reference ("Kit") is still a tab.
const wholeTabRange = (tab: string) => `'${tab.replaceAll("'", "''")}'!A1:Z500`;

export function missingSheetEnv(): string[] {
  return SHEET_ENV.filter((name) => !process.env[name]);
}

/*
  Reads every tab: first asks the sheet which tabs it has, then fetches them
  all in one request. Nothing about the process is assumed here.
*/
export async function readWholeSheet(): Promise<SheetRead> {
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
            : redact(
                String(result.error ?? 'Unknown error'),
                env.COMPOSIO_API_KEY,
              ),
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

  const readAt = new Date().toISOString();
  const info = await call('GOOGLESHEETS_GET_SPREADSHEET_INFO', {
    spreadsheet_id: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    fields:
      'properties.title,properties.timeZone,properties.locale,sheets.properties.sheetId,sheets.properties.title',
  });
  const parsedInfo = infoSchema.safeParse(info.data);
  const tabs = parsedInfo.success
    ? (parsedInfo.data.sheets ?? []).map(({ properties }) => properties.title)
    : [];
  const values = tabs.length
    ? await call('GOOGLESHEETS_BATCH_GET', {
        spreadsheet_id: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        ranges: tabs.map(wholeTabRange),
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

function redact(text: string, key: string) {
  return key ? text.replaceAll(key, '[redacted]') : text;
}
