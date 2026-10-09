import { describe, expect, it } from 'vitest';
import { isActionableFinding, type Finding, type Snapshot } from '../shared/types';
import { validateFinding } from '../server/evidence';
const finding: Finding = {
  id: 'limit', issueCode: 'TITLE_CURRENT_REGISTER', reviewer: 'ownership',
  category: 'assessment_limit', title: 'Current register needs review',
  requiresHumanReview: true, status: 'resolved', severity: 'clear',
  action: 'Human underwriter: obtain and review the current register.',
  explanation: 'The prepared extract is insufficient.', nextCheck: 'Review the register.',
  citations: [], validationWarnings: [],
};
describe('human-underwriter action classification', () => {
  it('keeps limitations requiring a human open even when the model calls them clear', () => {
    const validated = validateFinding(finding, { documents: [] } as unknown as Snapshot);
    expect(validated.status).toBe('open');
    expect(validated.severity).toBe('attention');
    expect(validated.category).toBe('assessment_limit');
    expect(isActionableFinding(validated)).toBe(true);
  });
  it('includes legacy open limitations without converting resolved evidence into tasks', () => {
    expect(isActionableFinding({ ...finding, requiresHumanReview: undefined, status: 'open', severity: 'clarify' })).toBe(true);
    expect(isActionableFinding({ ...finding, requiresHumanReview: false })).toBe(false);
    expect(isActionableFinding({ ...finding, requiresHumanReview: false, status: 'withdrawn' })).toBe(false);
  });
});
