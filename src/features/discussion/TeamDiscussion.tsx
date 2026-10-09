import {
  roleNames,
  roles,
  type Citation,
  type Intervention,
  type Review,
} from '../../../shared/types';
import { FindingAssessment } from '../findings/FindingAssessment';
import { ConsultationFeed } from './ConsultationFeed';

export function TeamDiscussion({
  review,
  interventions,
  cites,
}: {
  review: Review;
  interventions: Intervention[];
  cites: (c: Citation[]) => React.ReactNode;
}) {
  const outcome = { retain: 'Retained', narrow: 'Narrowed', withdraw: 'Withdrawn' };
  return (
    <div className="discussion grouped-discussion">
      {review.exchanges.some(
        (e) => e.kind === 'coverage-check' || e.kind === 'coverage-recheck',
      ) && (
        <section className="coverage-discussion" aria-label="Coverage checks and rechecks">
          <h3>Coverage checks and specialist rechecks</h3>
          {review.exchanges
            .filter((e) => e.kind === 'coverage-check' || e.kind === 'coverage-recheck')
            .map((e) => (
              <article className="thread-message" key={e.id}>
                <strong>
                  {e.kind === 'coverage-check'
                    ? `Coverage check · Lead → ${e.target ? roleNames[e.target] : 'Specialist'}`
                    : `Specialist recheck · ${roleNames[e.reviewer]}`}
                </strong>
                <p>{e.text}</p>
                {cites(e.citations)}
              </article>
            ))}
        </section>
      )}
      <ConsultationFeed review={review} cites={cites} />
      <div className="discussion-detail-heading">
        <h3>Findings and your questions</h3>
        <p>Expand a finding for evidence checks, your challenges, and the reviewer’s assessment.</p>
      </div>
      {[...roles, 'lead' as const].map((role) => {
        const findings = review.findings.filter((f) => f.reviewer === role);
        const summaries = review.exchanges.filter(
          (e) =>
            e.reviewer === role &&
            !e.findingId &&
            e.kind !== 'coverage-check' &&
            e.kind !== 'coverage-recheck',
        );
        if (!findings.length && !summaries.length) return null;
        return (
          <section className="reviewer-group" key={role} aria-label={roleNames[role]}>
            <h3>
              {roleNames[role]} <small>{findings.length} findings</small>
            </h3>
            {findings.map((f) => {
              const questions = interventions.filter(
                (i) => i.reviewId === review.id && i.findingId === f.id,
              );
              const exchanges = review.exchanges.filter(
                (e) => e.findingId === f.id && (e.kind !== 'human-response' || !questions.length),
              );
              return (
                <details className="finding-thread" key={f.id}>
                  <summary>
                    <strong>{f.title}</strong>
                    <span>
                      {f.category === 'assessment_limit' ? 'Assessment limitation' : f.status} ·{' '}
                      {f.reviewQuestions?.length || 0} evidence checks ·{' '}
                      {exchanges.filter((e) => e.kind === 'challenge').length} peer challenges ·{' '}
                      {questions.length} your questions
                    </span>
                  </summary>
                  <FindingAssessment finding={f} cites={cites} />
                  {!!questions.length && (
                    <section aria-label="Your challenges">
                      <h4>Your questions to {roleNames[role]}</h4>
                      {questions.map((i) => (
                        <article className="thread-message" key={i.id}>
                          <strong>Question from you · {i.state}</strong>
                          <p>{i.text}</p>
                          {i.citation && cites([i.citation])}
                          {i.response && (
                            <>
                              <strong>Answer from {roleNames[role]}</strong>
                              <p>{i.response}</p>
                              {cites(
                                review.exchanges.find(
                                  (e) =>
                                    e.kind === 'human-response' &&
                                    e.findingId === f.id &&
                                    e.text === i.response,
                                )?.citations || [],
                              )}
                            </>
                          )}
                          {i.disposition && (
                            <p className="thread-outcome">Outcome: {outcome[i.disposition]}</p>
                          )}
                          {review.exchanges.some(
                            (e) =>
                              e.kind === 'human-response' &&
                              e.findingId === f.id &&
                              e.text === i.response &&
                              e.unresolved,
                          ) && <p className="warning">Disagreement remains</p>}
                          {i.error && <p className="error">{i.error}</p>}
                        </article>
                      ))}
                    </section>
                  )}
                </details>
              );
            })}
            {summaries.map((e) => (
              <details className="reviewer-summary" key={e.id}>
                <summary>
                  {e.kind === 'lead' ? 'Lead brief' : 'Review summary'} · {roleNames[role]}
                </summary>
                <p className="preserve-lines">{e.text}</p>
                {cites(e.citations)}
              </details>
            ))}
          </section>
        );
      })}
    </div>
  );
}
