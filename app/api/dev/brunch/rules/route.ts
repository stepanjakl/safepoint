import {
  jsonWithBigInts,
  rejectUnlessLocalDevelopment,
} from '@/lib/dev/dev-route';
import { runRuleTrial } from '@/lib/processes/avocado-toast/rule-trial';

export const runtime = 'nodejs';

// Development only: runs the formula-engine trial on demand. No network.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  return jsonWithBigInts({ kind: 'result', report: runRuleTrial() });
}
