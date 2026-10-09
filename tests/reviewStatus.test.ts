import { expect, it } from 'vitest';
import { canCorrectLegacyPeerRerun } from '../server/reviewStatus';
import type { Review } from '../shared/types';
const old = {
  needsRerun: true,
  mode: 'cross',
  status: 'completed',
  stage: 4,
  brief: 'Saved summary',
  exchanges: [{ kind: 'response' }],
} as Review;
it('corrects only completed legacy peer consultation with no intervention history', () => {
  expect(canCorrectLegacyPeerRerun(old, false)).toBe(true);
  expect(canCorrectLegacyPeerRerun(old, true)).toBe(false);
  for (const patch of [
    { error: 'Lead failed' },
    { status: 'failed' },
    { brief: '' },
    { stage: 3 },
    { mode: 'specialist' },
    { statusPolicyVersion: 2 },
    { exchanges: [{ kind: 'human-response' }] },
  ])
    expect(canCorrectLegacyPeerRerun({ ...old, ...patch } as Review, false)).toBe(false);
});
