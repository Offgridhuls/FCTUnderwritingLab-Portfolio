import { isActionableFinding, roleNames, type Citation, type Finding } from '../../../shared/types';
export function FindingAssessment({
  finding: f,
  cites,
}: {
  finding: Finding;
  cites: (citations: Citation[]) => React.ReactNode;
}) {
  return (
    <div className={`finding-assessment ${isActionableFinding(f) ? 'actionable' : ''}`}>
      <p className="finding-owner">
        <strong>Reviewer: {roleNames[f.reviewer]}</strong> · {f.title}
      </p>
      {f.category === 'assessment_limit' && (
        <p className="assessment-limit">
          Assessment limitation · Not established by the supplied evidence. This is not a confirmed
          property defect.
        </p>
      )}
      {isActionableFinding(f) && (f.missingDocument || f.action || f.nextCheck) && (
        <section className="finding-action" aria-label="Next action">
          {f.missingDocument && (
            <p>
              <strong>
                {f.category === 'assessment_limit' ? 'Not assessed without:' : 'Missing:'}
              </strong>{' '}
              {f.missingDocument}
            </p>
          )}
          {f.impact && (
            <p>
              <strong>Why it matters:</strong> {f.impact}
            </p>
          )}
          {(f.action || f.nextCheck) && (
            <p>
              <strong>Next step:</strong> {f.action || f.nextCheck}
            </p>
          )}
        </section>
      )}
      <div className="assessment-sections">
        <section>
          <h3>What we know</h3>
          <p>{f.known || f.explanation}</p>
          <small>Based on supplied documents; not independent verification.</small>
          {cites(f.citations)}
        </section>
        <section>
          <h3>What remains uncertain</h3>
          <p>
            {f.uncertain ||
              'This older review did not separately record uncertainty. Run a full review to obtain a specific assessment.'}
          </p>
        </section>
        <section>
          <h3>What evidence would change this assessment</h3>
          <p>{f.changeEvidence || f.nextCheck}</p>
        </section>
      </div>
      <section className="review-questions">
        <h3>Reviewer questions & answers</h3>
        <p className="question-disclosure">
          {roleNames[f.reviewer]}’s own evidence checks for this finding. Peer challenges appear
          separately in Team discussion.
        </p>
        {f.reviewQuestions?.length ? (
          f.reviewQuestions.map((q, index) => (
            <details open key={index}>
              <summary>
                <span className="qa-label">Question · {roleNames[f.reviewer]}</span>
                {q.question}
              </summary>
              <p>
                <strong className="qa-label">Answer · {roleNames[f.reviewer]}</strong>
                {q.answer}
              </p>
              {cites(q.citations)}
              {q.citations.some((c) => !c.verified) && (
                <p className="error">Source validation failed. Do not rely on this answer.</p>
              )}
            </details>
          ))
        ) : (
          <p>
            No question-and-answer record was saved for this finding. Run a new full review to
            generate one.
          </p>
        )}
      </section>
    </div>
  );
}
