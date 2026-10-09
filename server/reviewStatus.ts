import type { Review } from '../shared/types.js';

export function canCorrectLegacyPeerRerun(review: Review, hasInterventions: boolean) {
  return (
    !review.statusPolicyVersion &&
    review.needsRerun &&
    review.mode === 'cross' &&
    review.status === 'completed' &&
    review.stage === 4 &&
    !!review.brief &&
    !review.error &&
    !hasInterventions &&
    !review.exchanges.some((e) => e.kind === 'human-response') &&
    review.exchanges.some((e) => e.kind === 'response')
  );
}
