import { describe, it, expect } from 'vitest';
import { visibleTopic, outcomeOrder, readableField } from '../src/features/comparison/comparisonPresentation';
import type { TopicComparison } from '../shared/comparison';
const topic = (patch: Partial<TopicComparison> = {}) =>
  ({
    id: 'authority',
    reviewer: 'ownership',
    label: 'Authority',
    outcome: 'unchanged',
    changed: false,
    before: {
      status: 'no_issue',
      explanation: '',
      findings: [],
      limitations: [],
      citations: [],
      reasons: [],
    },
    after: {
      status: 'no_issue',
      explanation: '',
      findings: [],
      limitations: [],
      citations: [],
      reasons: [],
    },
    ...patch,
  }) as TopicComparison;
describe('comparison presentation filters', () => {
  it('includes gaps and changed outcomes, but hides unchanged topics without follow-up', () => {
    expect(visibleTopic(topic(), false, '', '')).toBe(false);
    expect(visibleTopic(topic({ changed: true }), false, '', '')).toBe(true);
    expect(visibleTopic(topic({ outcome: 'uncertain' }), false, '', '')).toBe(true);
    expect(visibleTopic(topic(), true, '', '')).toBe(true);
  });
  it('keeps unchanged actionable findings and verification limitations visible', () => {
    for (const kind of ['findings', 'limitations']) {
      const t = topic();
      (t.after as any)[kind] = [{ id: 'f', status: 'open', requiresHumanReview: true }];
      expect(visibleTopic(t, false, '', '')).toBe(true);
      expect(visibleTopic(t, false, 'identity', '')).toBe(false);
      expect(visibleTopic(t, false, 'ownership', 'new')).toBe(false);
    }
  });
  it('preserves outcome order and readable field labels', () => {
    expect(outcomeOrder).toEqual(['addressed', 'new', 'action', 'uncertain', 'unchanged']);
    expect(readableField('purchasePrice')).toBe('Purchase price');
  });
});
