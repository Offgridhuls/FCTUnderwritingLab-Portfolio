import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ConsultationFeed } from '../src/features/discussion/ConsultationFeed';
import type { Review, Exchange } from '../shared/types';
const question: Exchange = {
  id: 'q1',
  kind: 'challenge',
  reviewer: 'ownership',
  target: 'mortgage',
  findingId: 'f1',
  text: 'Does the changed closing date invalidate the payout?',
  citations: [],
};
function render(
  exchanges: Exchange[],
  status: Review['status'] = 'completed',
  mode: Review['mode'] = 'cross',
) {
  const review = {
    exchanges,
    status,
    mode,
    stageName: 'Responses',
    findings: [{ id: 'f1', title: 'Payout expiry', reviewer: 'mortgage' }],
  } as Review;
  return renderToStaticMarkup(createElement(ConsultationFeed, { review, cites: () => null }));
}
describe('consultation presentation', () => {
  it('groups questions from multiple specialists under one consolidated response', () => {
    const html = render([
      question,
      { ...question, id: 'q2', reviewer: 'property' },
      {
        id: 'a1',
        kind: 'response',
        reviewer: 'mortgage',
        findingId: 'f1',
        text: 'Updated creditor evidence is still needed.',
        citations: [],
        disposition: 'retain',
        unresolved: true,
      },
    ]);
    expect(html.match(/class="consultation-card"/g)).toHaveLength(1);
    expect(html.match(/Updated creditor evidence is still needed\./g)).toHaveLength(1);
    expect(html).toContain('CONSOLIDATED REPLY');
    expect(html).toContain('Disagreement remains');
  });
  it('does not invent a reply for an interrupted or paused review', () => {
    expect(render([question], 'failed')).toContain('No response recorded · Review incomplete');
    expect(render([question], 'paused')).toContain('Reply pending · Review paused');
    expect(render([question], 'running')).toContain('Awaiting reviewer response');
    expect(render([question], 'failed')).not.toContain('Finding retained');
  });
  it('distinguishes no challenges from a mode with no cross-review', () => {
    expect(render([])).toContain('No material peer challenges were raised');
    expect(render([], 'completed', 'specialist')).toContain('does not include peer consultation');
  });
});
