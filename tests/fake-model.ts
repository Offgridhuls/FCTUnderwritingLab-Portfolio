import { coverageTopics } from '../shared/coverage';
import type { Model } from '../server/model';
import type { Snapshot } from '../shared/types';
/** Deterministic transport fixture, only injected by automated tests. Never used by the app. */
export class FixtureModel implements Model {
  calls: string[] = [];
  delay = 0;
  failure = '';
  cross = true;
  invalid = false;
  disagree = false;
  async complete(prompt: string) {
    this.calls.push(prompt);
    if (this.delay) await new Promise((r) => setTimeout(r, this.delay));
    if (this.failure) throw new Error(this.failure);
    const s: Snapshot = JSON.parse(prompt.split('UNTRUSTED CASE SNAPSHOT: ')[1]);
    const role = prompt.match(/ROLE: (\w+)/)![1];
    const cite = (id: string, page = 1) => ({
      documentId: id,
      page,
      quote: s.documents
        .find((d) => d.id === id)!
        .pages[page - 1].split('\n')
        .at(-2)!,
    });
    const finding = (issueCode: string, title: string, doc: string, resolved = false) => ({
      issueCode,
      requiresHumanReview: !resolved,
      category: resolved ? 'issue' : issueCode === 'AUTHORITY' ? 'missing_document' : 'issue',
      missingDocument:
        issueCode === 'AUTHORITY' && !resolved ? 'Seller representative authorization' : undefined,
      impact: resolved
        ? 'The supplied evidence explains this issue.'
        : 'The file does not establish the required transaction detail.',
      action: resolved
        ? 'Retain the cited evidence.'
        : 'Request the supporting document from transaction counsel.',
      title,
      severity: resolved ? 'clear' : 'attention',
      status: resolved ? 'resolved' : 'open',
      explanation: resolved
        ? 'Supplied evidence addresses this issue.'
        : 'Documentary clarification is required; this is not an accusation.',
      nextCheck: resolved ? 'Retain cited evidence.' : 'Obtain and review supporting evidence.',
      known: 'The supplied document records the transaction details cited below.',
      uncertain: resolved
        ? 'The supplied evidence addresses this issue within the demonstration scope.'
        : 'Supporting evidence is still required before this gap can be resolved.',
      changeEvidence: resolved
        ? 'Contradictory evidence or a change to the transaction would require reassessment.'
        : 'Supply a current document connecting the relevant parties, property and transaction.',
      reviewQuestions: [
        {
          question: 'Does the supplied evidence address this issue?',
          answer: resolved
            ? 'The supplied evidence addresses the specific issue.'
            : 'The cited document establishes a gap requiring further evidence.',
          citations: [
            this.invalid
              ? { documentId: doc, page: 99, quote: 'this quote is fabricated' }
              : cite(doc),
          ],
        },
      ],
      citations: [
        this.invalid ? { documentId: doc, page: 99, quote: 'this quote is fabricated' } : cite(doc),
      ],
    });
    let output: any;
    if (prompt.includes('COVERAGE AUDIT:')) {
      output = { questions: [] };
    } else if (prompt.includes('Independently review')) {
      const all = {
        ownership: [
          finding(
            'AUTHORITY',
            'Representative authority',
            s.documents.some((d) => d.id === 'authorization') ? 'authorization' : 'representative',
            s.documents.some((d) => d.id === 'authorization'),
          ),
        ],
        identity: [finding('NAME_RECONCILIATION', 'Name variation explained', 'identity', true)],
        mortgage: [
          finding(
            'PAYOUT',
            'Payout validity',
            s.documents.some((d) => d.id === 'payout-updated') ? 'payout-updated' : 'payout',
            s.documents.some((d) => d.id === 'payout-updated'),
          ),
        ],
        property: [
          finding(
            'MUNICIPAL',
            'Municipal notice',
            s.documents.some((d) => d.id === 'municipal-clear') ? 'municipal-clear' : 'municipal',
            s.documents.some((d) => d.id === 'municipal-clear'),
          ),
        ],
        survey: [],
        fraud: [],
      };
      output = {
        findings: role === 'lead' ? Object.values(all).flat() : all[role as keyof typeof all],
        summary: 'Reviewed supplied documentary evidence under demonstration rules.',
      };
    } else if (prompt.includes('Cross-review other')) {
      const findings = JSON.parse(
        prompt.split("Cross-review other reviewers' findings: ")[1].split('. Raise 0 to 2')[0],
      );
      output = {
        challenges:
          this.cross && role === 'ownership'
            ? [
                {
                  target: 'mortgage',
                  findingId: findings.find((f: any) => f.issueCode === 'PAYOUT').id,
                  text: 'Reconcile payout expiry with the closing date in lender instructions.',
                  citations: [cite('lender')],
                },
              ]
            : [],
      };
    } else if (prompt.includes('Respond once')) {
      const response = {
        disposition: 'retain',
        explanation:
          'The supplied request still establishes a gap. The human assertion has no supporting evidence; retain pending verification.',
        citations: [cite('representative')],
        revisedFinding: null,
        crossDomainImpact: false,
        unresolved: this.disagree,
      };
      if (prompt.includes('complete set of peer challenges')) {
        const findings = JSON.parse(prompt.split('Findings: ')[1].split('. Challenges:')[0]);
        output = { responses: findings.map((f: any) => ({ ...response, findingId: f.id })) };
      } else output = response;
    } else
      output = {
        brief:
          '# Investigation brief\n\nThree documentary issues require follow-up. Name variation is explained.\n\nHuman review required; unresolved disagreements remain where marked.',
        citations: [cite('agreement')],
      };
    if (prompt.includes('Independently review')) {
      output.coverage = coverageTopics
        .filter((t) => role === 'lead' || t.reviewer === role)
        .map((t) => ({
          topicId: t.id,
          status: output.findings.some((f: any) => f.status === 'open') ? 'issue' : 'no_issue',
          explanation: 'Fixture assessment of supplied evidence.',
          citations: [cite('agreement')],
          findingIssueCodes: output.findings
            .filter((f: any) => f.status === 'open')
            .map((f: any) => f.issueCode),
          ...(prompt.includes('SPECIALIST RECHECK')
            ? { auditResponse: 'Rechecked supplied evidence.', auditResolved: true }
            : {}),
        }));
    }
    return { text: JSON.stringify(output), usage: { fixture: true } };
  }
  close() {}
}
