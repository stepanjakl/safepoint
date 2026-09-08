import { loadReviewedReplay } from '@/lib/promotion-release';
import { parseSkuParam, presentReview } from '@/lib/review-presentation';
import { presentPromotionDetail } from '@/lib/review/promotion-adapter';
import { supportDetails } from '@/lib/review/support-fixture';

// Public, read-only synthetic fixtures. Never accepts a proposal or a decision.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ process: string; id: string }> },
) {
  const { process, id } = await params;
  if (process === 'promotion-release') {
    const sku = parseSkuParam(id);
    const replay = loadReviewedReplay();
    const line = replay.lines.find((candidate) => candidate.sku === sku);
    if (sku && line) {
      const presentation = presentReview(replay);
      return Response.json(
        presentPromotionDetail(
          line,
          presentation.details[sku],
          presentation.batch.fixtureVersion,
        ),
      );
    }
  }
  if (process === 'support-handoff') {
    const detail = supportDetails.find((item) => item.id === id);
    if (detail) return Response.json(detail);
  }
  return Response.json({ error: 'Replay item not found' }, { status: 404 });
}
