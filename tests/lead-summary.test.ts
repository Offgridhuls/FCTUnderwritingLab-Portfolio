import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect } from 'vitest';
import { LeadSummary, cleanBriefDisplay } from '../src/features/reviews/LeadSummary';
import type { Review, Citation, Finding } from '../shared/types';
const citation: Citation = {
  documentId: 'lead-source',
  page: 3,
  quote: 'Exact source',
  verified: true,
};
it('does not carry failure banners into a successful current assessment', () => {
  const html = render({ coverageStatus: 'complete', needsRerun: false, error: undefined });
  expect(html).toContain('The lead’s summary is ready.');
  expect(html).not.toContain('Incomplete assessment');
  expect(html).not.toContain('Coverage is incomplete');
  expect(html).not.toContain('No completed lead summary');
});
it('shows peer follow-up without an incomplete-assessment or rerun banner', () => {
  const html = render({
    coverageStatus: 'complete',
    needsRerun: false,
    crossSpecialtyFollowup: true,
  });
  expect(html).toContain('The lead’s summary is ready.');
  expect(html).toContain('Cross-specialty follow-up remains.');
  expect(html).not.toContain('Full rerun required');
  expect(html).not.toContain('Incomplete assessment');
});
function render(overrides: Partial<Review> = {}, revision = 1, updating = false) {
  const review = {
    id: 'r1',
    revision: 1,
    status: 'completed',
    mode: 'cross',
    brief: '# Summary\n\n- Check authority\n- Obtain payout',
    exchanges: [],
    ...overrides,
  } as Review;
  return renderToStaticMarkup(
    createElement(LeadSummary, {
      review,
      revision,
      updating,
      cites: (c) =>
        createElement('span', null, c.map((x) => `${x.documentId}:${x.page}`).join(',')),
    }),
  );
}
it('renders Markdown without executable HTML, remote images or unsafe links', () => {
  const html = render({
    brief:
      '# Summary\n\n- Check authority\n\n<script>alert(1)</script>\n\n![image](https://example.com/track)\n\n[click](javascript:alert(1))',
  });
  expect(html).toContain('<h3>Summary</h3>');
  expect(html).toContain('<li>Check authority</li>');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('javascript:');
});
it('uses only the citations attached to the matching lead brief', () => {
  const exchanges: Review['exchanges'] = [
    {
      id: 'old',
      reviewer: 'lead',
      kind: 'lead',
      text: 'Old brief',
      citations: [{ ...citation, documentId: 'old-source' }],
    },
    { id: 'current', reviewer: 'lead', kind: 'lead', text: 'Current brief', citations: [citation] },
  ];
  expect(render({ brief: 'Current brief', exchanges })).toContain('lead-source:3');
  expect(render({ brief: 'Current brief', exchanges })).not.toContain('old-source:');
  expect(render({ brief: 'Old brief', exchanges })).toContain('old-source:3');
  expect(render({ brief: 'Revised brief', exchanges })).toContain('No source references');
});
it('labels pending, incomplete, stale and scoped assessments honestly', () => {
  expect(render({ brief: '', status: 'running' })).toContain(
    'The lead summary will appear after the team finishes.',
  );
  expect(render({ brief: '', status: 'failed' })).toContain(
    'No completed lead summary is available.',
  );
  expect(render({ needsRerun: true })).toContain('Full rerun required');
  expect(render({}, 2)).toContain('Older revision');
  expect(render({ mode: 'specialist', selectedReviewer: 'mortgage' })).toContain(
    'Partial scope: Mortgages',
  );
  expect(render({}, 1, true)).toContain('has not yet been updated');
});

it('keeps compact actionable rows, conditions and disagreements', () => {
  const base: Finding = {
    issueCode: 'SURVEY_TEST',
    nextCheck: 'If required, obtain a survey.',
    id: 'f',
    reviewer: 'survey',
    title: 'Survey unavailable',
    category: 'assessment_limit',
    requiresHumanReview: true,
    status: 'open',
    severity: 'attention',
    explanation: 'No survey supplied.',
    uncertain: 'Boundaries are unknown.',
    impact: 'Boundary matters cannot be assessed.',
    action: 'If required, obtain a survey.',
    citations: [citation],
    validationWarnings: [],
  };
  const html = render({
    findings: [
      base,
      {
        ...base,
        id: 'f2',
        category: 'missing_document',
        title: 'Missing authorization',
        missingDocument: 'Authorization',
        reviewer: 'survey',
      },
    ] as Review['findings'],
    exchanges: [
      {
        id: 'e',
        kind: 'response',
        reviewer: 'survey',
        findingId: 'f',
        text: 'Unresolved',
        citations: [],
        unresolved: true,
      },
    ],
  });
  expect(html.match(/class="lead-action-card"/g)).toHaveLength(2);
  expect(html.indexOf('<h5>Authorization')).toBeLessThan(html.indexOf('<h5>Survey unavailable'));
  expect(html).toContain('If required, obtain a survey.');
  expect(html).toContain('Not assessed');
  expect(html).not.toContain('<dt>Why it matters</dt>');
  expect(html).toContain('Disagreement remains');
  expect(html).not.toContain('Boundaries are unknown.');
});
it('preserves substantive legacy text and tables while removing only known empty diagnostics', () => {
  const boilerplate =
    '**Workflow:** Running, stage 3 completed; this lead brief is the normal fourth stage. **Needs full rerun:** No (`needsRerun=false`). **Assumptions:** None supplied. **Invalid citations:** None identified.';
  expect(cleanBriefDisplay(boilerplate)).toBe('');
  const warning = boilerplate.replace('None identified.', 'Invalid page in title document.');
  expect(cleanBriefDisplay(warning)).toBe(warning);
  const assumption = boilerplate.replace('None supplied.', 'Closing date is hypothetical.');
  expect(cleanBriefDisplay(assumption)).toBe(assumption);
  const html = render({
    brief: '| Issue | Next step |\n|---|---|\n| Payout | Request updated statement |',
  });
  expect(html).toContain('Full saved brief');
  expect(html).toContain('<table>');
  expect(html).toContain('Request updated statement');
});
it('never presents an incomplete or outdated empty finding set as cleared', () => {
  expect(render({ findings: [], status: 'failed' })).toContain(
    'does not establish a completed assessment',
  );
  expect(render({ findings: [] }, 2)).toContain('does not establish a completed assessment');
  expect(render({ findings: [] })).toContain('within this review’s scope');
});
