import { ArrowRight, CornerDownRight, MessageSquare } from 'lucide-react';
import { roleNames, type Citation, type Review } from '../../../shared/types';

export function ConsultationFeed({
  review,
  cites,
}: {
  review: Review;
  cites: (c: Citation[]) => React.ReactNode;
}) {
  const challenges = review.exchanges.filter((e) => e.kind === 'challenge');
  const findingIds = [...new Set(challenges.map((e) => e.findingId))];
  const responding = review.status === 'running';
  const disposition = {
    retain: 'Finding retained',
    narrow: 'Finding narrowed',
    withdraw: 'Finding withdrawn',
  };
  const pending =
    review.status === 'paused'
      ? 'Reply pending · Review paused'
      : responding
        ? 'Awaiting reviewer response'
        : 'No response recorded · Review incomplete';
  return (
    <section className="consultation-feed" aria-label="Reviewer consultations">
      <div className="consultation-heading">
        <div>
          <span className="eyebrow">REVIEWER TO REVIEWER</span>
          <h3>Team consultations</h3>
          <p>Evidence-based questions and replies shared by the team.</p>
        </div>
        <span className="pill">
          {challenges.length} {challenges.length === 1 ? 'question' : 'questions'} ·{' '}
          {findingIds.length} {findingIds.length === 1 ? 'finding' : 'findings'}
        </span>
      </div>
      <p className="consultation-stage" role="status">
        {review.stageName}
        {review.status === 'paused'
          ? ' · Paused'
          : ['failed', 'interrupted', 'cancelled'].includes(review.status)
            ? ' · Incomplete'
            : ''}
      </p>
      {!challenges.length && (
        <div className="consultation-empty">
          <MessageSquare size={22} />
          <p>
            {review.mode !== 'cross'
              ? 'This review does not include peer consultation. Run a full cross-review to let specialists consult one another.'
              : review.status === 'completed'
                ? 'No material peer challenges were raised. Reviewers are not required to disagree.'
                : review.status === 'running'
                  ? 'No consultations posted yet. Questions appear after cross-review, followed by specialist responses.'
                  : 'No peer consultations recorded so far. This review has not completed.'}
          </p>
        </div>
      )}
      {findingIds.map((id) => {
        const questions = challenges.filter((e) => e.findingId === id);
        const finding = review.findings.find((f) => f.id === id);
        const answers = review.exchanges.filter((e) => e.kind === 'response' && e.findingId === id);
        const owner = finding?.reviewer || questions[0].target;
        const participants = [...new Set(questions.map((e) => e.reviewer))];
        return (
          <article
            className="consultation-card"
            key={id || questions[0].id}
            aria-label={`Consultation: ${finding?.title || 'Finding unavailable'}`}
          >
            <header>
              <div className="consultation-participants">
                <span>{participants.map((r) => roleNames[r]).join(' + ')}</span>
                <ArrowRight size={17} aria-label="consults" />
                <strong>{owner ? roleNames[owner] : 'Reviewer not recorded'}</strong>
              </div>
              <h4>{finding?.title || 'Finding unavailable'}</h4>
              <small>
                {questions.length > 1
                  ? 'Questions grouped by finding · One consolidated specialist response'
                  : 'Peer question and specialist response'}
              </small>
            </header>
            <div className="consultation-messages">
              {questions.map((q) => (
                <section
                  className="consultation-message question"
                  key={q.id}
                  aria-label={`Question from ${roleNames[q.reviewer]}`}
                >
                  <div className="consultation-speaker">
                    <span className="consultation-avatar">
                      {roleNames[q.reviewer]
                        .split(' ')
                        .map((s) => s[0])
                        .filter((s) => s !== '&')
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div>
                      <strong>{roleNames[q.reviewer]}</strong>
                      <small>
                        Asks{' '}
                        {q.target
                          ? roleNames[q.target]
                          : owner
                            ? roleNames[owner]
                            : 'the finding owner'}
                      </small>
                    </div>
                    <span className="consultation-label">QUESTION</span>
                  </div>
                  <p>{q.text}</p>
                  {cites(q.citations)}
                </section>
              ))}
              {answers.map((a) => (
                <section
                  className="consultation-message answer"
                  key={a.id}
                  aria-label={`Answer from ${roleNames[a.reviewer]}`}
                >
                  <div className="consultation-speaker">
                    <CornerDownRight size={20} />
                    <div>
                      <strong>{roleNames[a.reviewer]}</strong>
                      <small>
                        Replies to {participants.map((r) => roleNames[r]).join(' and ')}
                      </small>
                    </div>
                    <span className="consultation-label">
                      {questions.length > 1 ? 'CONSOLIDATED REPLY' : 'REPLY'}
                    </span>
                  </div>
                  <p>{a.text}</p>
                  {cites(a.citations)}
                  <div className={`consultation-outcome ${a.unresolved ? 'unresolved' : ''}`}>
                    <strong>
                      {a.disposition ? disposition[a.disposition] : 'Disposition not recorded'}
                    </strong>
                    {a.unresolved && <span>Disagreement remains · Human follow-up needed</span>}
                  </div>
                </section>
              ))}
              {!answers.length && (
                <div className="consultation-pending" role="status">
                  <CornerDownRight size={17} />
                  {pending}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
