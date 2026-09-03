import { ReviewWorkspace } from '@/components/review/review-workspace';
import { loadReviewedReplay } from '@/lib/promotion-release';
import { parseSkuParam, presentReview } from '@/lib/review-presentation';

const DEFAULT_SKU = 'ALD-0025';

export default async function ReviewPage({ searchParams }: PageProps<'/'>) {
  const presentation = presentReview(loadReviewedReplay());
  const initialSku = parseSkuParam((await searchParams).sku) ?? DEFAULT_SKU;

  return (
    <ReviewWorkspace
      presentation={presentation}
      initialSku={initialSku}
      mainId="main"
      className="min-h-dvh"
    />
  );
}
