/*
  Starts the Workflow World as the server starts (server/workflows/). In
  development that is the Local World, whose start re-enqueues the runs a
  stopped server left pending or running, so a draft or a proposal carries on
  after a restart; the Vercel World has nothing to start. Imported inside the
  guard, in this form: Next also compiles this file for the Edge runtime,
  and an early return leaves the import in that bundle, which cannot load it.
*/
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getWorld } = await import('workflow/runtime');
    await (await getWorld()).start?.();
  }
}
