import type { Step } from '@/lib/dev/class-origins';

// Development only: for one element, the line that writes each of its classes,
// from the JSX lines the style inspector found for it. Read on every request,
// so an edit is in the next inspection without a restart.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new Response(null, { status: 404 });
  }
  const { steps, tokens } = (await request.json()) as {
    steps: Step[];
    tokens: string[];
  };
  const { classOrigins } = await import('@/lib/dev/class-origins');
  return Response.json(classOrigins(process.cwd(), steps, tokens));
}
