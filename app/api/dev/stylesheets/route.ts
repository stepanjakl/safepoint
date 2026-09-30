import { readStylesheets } from '@/lib/dev/stylesheets';

// Development only: where every rule, utility and custom property is declared,
// for the style inspector. Read on every request, so an edit is in the next
// inspection without a restart.
export const dynamic = 'force-dynamic';

export function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return new Response(null, { status: 404 });
  }
  return Response.json(readStylesheets(process.cwd(), { preflight: true }));
}
