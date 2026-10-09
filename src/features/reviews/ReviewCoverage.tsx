import { coverageLabels, coverageTopics } from '../../../shared/coverage';
import { roleNames, roles, type Citation, type Finding, type Review } from '../../../shared/types';
export function ReviewCoverage({
  review: r,
  cites,
  onFinding,
}: {
  review: Review;
  cites: (c: Citation[]) => React.ReactNode;
  onFinding?: (f: Finding) => void;
}) {
  if (!r.coverageVersion)
    return <p className="coverage-legacy">Coverage checklist not recorded for this review.</p>;
  return (
    <section className="review-coverage" aria-label="Review coverage">
      <h3>
        Review coverage{' '}
        <small>
          {r.coverageStatus === 'complete'
            ? 'Assigned topics accounted for'
            : r.coverageStatus === 'pending'
              ? 'Checks in progress'
              : 'Coverage incomplete'}
        </small>
      </h3>
      <p>Demonstration checklist · Recorded coverage is not a guarantee of accuracy.</p>
      {roles.map((role) => {
        const topics = coverageTopics.filter((t) => t.reviewer === role);
        const assigned = r.mode !== 'specialist' || r.selectedReviewer === role;
        return (
          <div className="coverage-reviewer" key={role}>
            <h4>
              {roleNames[role]}
              {!assigned && ' · Not assessed in this run'}
            </h4>
            {assigned &&
              topics.map((t) => {
                const c = r.coverage?.find((c) => c.topicId === t.id);
                const gap = !c || c.gaps.length > 0;
                return (
                  <details
                    className={gap ? 'coverage-gap' : ''}
                    key={`${r.id}-${t.id}-${gap}`}
                    open={gap}
                  >
                    <summary>
                      {t.label}
                      <span>{gap ? 'Coverage gap' : coverageLabels[c.status]}</span>
                    </summary>
                    <p>{c?.explanation || 'No assessment recorded.'}</p>
                    {c?.scenario && (
                      <div>
                        <strong>
                          Within supplied evidence: {coverageLabels[c.scenario.status]}
                        </strong>
                        <p>{c.scenario.explanation}</p>
                        {cites(c.scenario.citations)}
                        {c.scenario.limitationIds.length > 0 && (
                          <p>Separate human-verification limitations remain linked below.</p>
                        )}
                      </div>
                    )}
                    {c?.gaps.map((g, i) => (
                      <p className="warning" key={i}>
                        {g}
                      </p>
                    ))}
                    {c?.auditQuestion && (
                      <p>
                        <strong>Coverage check:</strong> {c.auditQuestion}
                      </p>
                    )}
                    {c?.auditResponse && (
                      <p>
                        <strong>Specialist recheck:</strong> {c.auditResponse}
                      </p>
                    )}
                    {c && cites(c.citations)}
                    {c?.findingIds.map((id) => {
                      const f = r.findings.find((f) => f.id === id);
                      return f && onFinding ? (
                        <button key={id} onClick={() => onFinding(f)}>
                          View finding: {f.title}
                        </button>
                      ) : null;
                    })}
                  </details>
                );
              })}
          </div>
        );
      })}
    </section>
  );
}
