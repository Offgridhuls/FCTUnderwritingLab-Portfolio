import { FileCheck2 } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  isActionableFinding,
  roleNames,
  roles,
  type Citation,
  type Finding,
  type Review,
} from '../../../shared/types';
import { ReviewCoverage } from './ReviewCoverage';

// Match only the known empty diagnostic paragraph; preserve anything else verbatim.
export function cleanBriefDisplay(text: string) {
  return text
    .split(/\n\s*\n/)
    .filter(
      (p) =>
        !/^\*\*Workflow:\*\* Running, stage 3 completed; this lead brief is the normal fourth stage\.\s*\*\*Needs full rerun:\*\* No \(`needsRerun=false`\)\.\s*\*\*Assumptions:\*\* None supplied\.\s*\*\*Invalid citations:\*\* None identified\.(?:\s*All records are synthetic demonstration materials; this is not an authentication, coverage, closing-clearance, legal, or final underwriting determination\.)?\s*$/.test(
          p.trim(),
        ),
    )
    .join('\n\n');
}
function BriefText({ text }: { text: string }) {
  return (
    <div className="lead-markdown">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
          img: () => null,
          a: ({ children }) => <span>{children}</span>,
          table: ({ children }) => (
            <div
              className="lead-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Saved brief table"
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
export function LeadSummary({
  review,
  revision,
  updating = false,
  cites,
  onFinding,
}: {
  review?: Review;
  revision: number;
  updating?: boolean;
  cites: (c: Citation[]) => React.ReactNode;
  onFinding?: (f: Finding) => void;
}) {
  const stale = !!review && review.revision !== revision;
  const incomplete =
    !!review &&
    (['failed', 'cancelled', 'interrupted'].includes(review.status) ||
      review.needsRerun ||
      (review.status === 'completed' && !review.brief));
  const coverageGaps = review?.coverageStatus === 'incomplete';
  const gapCount = review?.coverage?.filter((topic) => topic.gaps.length).length || 0;
  const ready =
    !!review &&
    review.status === 'completed' &&
    !incomplete &&
    !stale &&
    !updating &&
    !coverageGaps;
  const lead = review?.exchanges.findLast((e) => e.kind === 'lead' && e.text === review.brief);
  const scope = !review
    ? 'Not reviewed'
    : review.mode === 'specialist'
      ? `Partial scope: ${review.selectedReviewer ? roleNames[review.selectedReviewer] : 'one specialist'} only · Other areas not assessed`
      : review.mode === 'single'
        ? 'Single-reviewer assessment · No peer cross-review'
        : review.mode === 'independent'
          ? 'Independent team · No peer cross-review'
          : 'Full team · Cross-review';
  const findings = (review?.findings || []).filter(isActionableFinding);
  const legacy =
    !!review?.brief &&
    (/\|.*\|/.test(review.brief) ||
      /needsRerun=|\*\*Workflow:|escalation checklist/i.test(review.brief));
  const narrative = cleanBriefDisplay(review?.brief || '');
  const warnings = [
    ...new Set((review?.findings || []).flatMap((f) => f.validationWarnings || [])),
  ];
  const summaryBody = (
    <>
      <BriefText text={narrative} />
      <div className="lead-summary-sources">
        <strong>Lead’s supporting evidence</strong>
        {lead?.citations.length ? (
          cites(lead.citations)
        ) : (
          <p>No source references were recorded with this brief.</p>
        )}
      </div>
    </>
  );
  return (
    <section className="lead-summary" aria-label="Lead reviewer summary">
      <header className="lead-summary-heading">
        <div>
          <span className="eyebrow">
            <FileCheck2 size={15} /> HUMAN UNDERWRITER BRIEF
          </span>
          <h2>Lead reviewer summary</h2>
        </div>
        <span className="pill">
          {!review
            ? 'Not started'
            : stale
              ? 'Older revision'
              : incomplete
                ? 'Incomplete'
                : updating
                  ? 'Updating'
                  : review.status === 'completed'
                    ? coverageGaps
                      ? 'Completed · Coverage incomplete'
                      : 'Completed'
                    : review.status === 'paused'
                      ? 'Paused'
                      : 'In progress'}
        </span>
      </header>
      <p className="lead-summary-meta">
        {scope}
        {review && ` · Review revision ${review.revision}`}
      </p>
      <div className="lead-summary-status" role="status">
        {ready && (
          <p>
            <strong>
              {review.mode === 'cross' || review.mode === 'independent'
                ? 'Team review complete.'
                : 'Selected review complete.'}
            </strong>{' '}
            The lead’s summary is ready. Review the findings and next steps below.
          </p>
        )}
        {stale && (
          <p className="warning">
            Older revision · This summary describes revision {review!.revision}. The case is now
            revision {revision}; run a new review for the current evidence.
          </p>
        )}
        {coverageGaps && (
          <p className="warning">
            {review?.status === 'completed' && review.brief && !incomplete
              ? 'The lead summary is available, but coverage is incomplete. '
              : 'Coverage is incomplete. '}
            {gapCount
              ? `${gapCount} checklist topic${gapCount === 1 ? '' : 's'} need a supported assessment. `
              : ''}
            Open Review coverage below for the specific reasons. This is separate from open
            transaction findings.
          </p>
        )}
        {incomplete && (
          <p className="warning">
            Incomplete assessment{review?.needsRerun ? ' · Full rerun required' : ''}.{' '}
            {review?.brief
              ? 'The preserved brief below is not a completed current assessment.'
              : 'No completed lead summary is available.'}{' '}
            Run a new review to complete the assessment.
          </p>
        )}
        {review?.error && <p className="error">{review.error}</p>}
        {review?.crossSpecialtyFollowup && (
          <p>
            Cross-specialty follow-up remains. Review the team discussion and assigned next steps;
            this does not by itself require another full team run.
          </p>
        )}
        {updating && (
          <p>
            Human challenge pending · The displayed brief has not yet been updated for this
            intervention.
          </p>
        )}
        {review?.status === 'paused' && !incomplete && (
          <p>Review paused. Resume it to finish the remaining work and update the summary.</p>
        )}
        {review?.status === 'running' && !incomplete && (
          <p>
            The lead summary will appear after the team finishes.
            {review.brief ? ' The saved brief may change as the review continues.' : ''}
          </p>
        )}
        {!review && <p>Start a team review to receive the lead’s summary.</p>}
      </div>
      {!!review?.snapshot?.assumptions.length && (
        <div className="lead-context">
          <strong>Assumptions used in this review</strong>
          <ul>
            {review.snapshot.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {!!warnings.length && (
        <div className="lead-context warning">
          <strong>Evidence references need attention</strong>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {review?.brief && !legacy && summaryBody}
      {review && (
        <section className="lead-actions" aria-label="What needs your attention">
          <h3>What needs your attention</h3>
          {!findings.length && (
            <p>
              {ready
                ? 'No actionable findings were recorded within this review’s scope.'
                : 'No actionable findings recorded so far. This does not establish a completed assessment of the current case.'}
            </p>
          )}
          {[...roles, 'lead' as const].map((role) => {
            const owned = findings
              .filter((f) => f.reviewer === role)
              .sort(
                (a, b) =>
                  Number(a.category === 'assessment_limit') -
                  Number(b.category === 'assessment_limit'),
              );
            if (!owned.length) return null;
            return (
              <section
                className="lead-action-group"
                key={role}
                aria-label={`${roleNames[role]} next steps`}
              >
                <h4>
                  {roleNames[role]} <span>{owned.length}</span>
                </h4>
                <div className="lead-action-grid">
                  {owned.map((f) => {
                    const limited = f.category === 'assessment_limit',
                      missing = f.category === 'missing_document';
                    const disagreement = review.exchanges.some(
                      (e) => e.findingId === f.id && e.unresolved,
                    );
                    return (
                      <article className="lead-action-card" key={f.id} aria-label={f.title}>
                        <div className="lead-action-copy">
                          <div className="lead-action-title">
                            <h5>{missing ? f.missingDocument || f.title : f.title}</h5>
                            <span className="lead-action-category">
                              {limited
                                ? 'Not assessed'
                                : missing
                                  ? 'Missing document'
                                  : 'Needs review'}
                            </span>
                          </div>
                          <p className="lead-action-next">
                            <strong>Next:</strong>{' '}
                            {f.action ||
                              f.nextCheck ||
                              'Ask the reviewer to clarify the next step.'}
                          </p>
                          {disagreement && (
                            <span className="lead-action-disagreement">Disagreement remains</span>
                          )}
                        </div>
                        {onFinding && (
                          <button className="text-button" onClick={() => onFinding(f)}>
                            View finding
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </section>
      )}
      {review?.brief && legacy && (
        <details className="lead-saved-brief">
          <summary>Full saved brief</summary>
          <p className="lead-summary-meta">
            Original narrative retained for reference. The cards above organize its recorded
            actionable findings.
          </p>
          {summaryBody}
        </details>
      )}
      {review && <ReviewCoverage review={review} cites={cites} onFinding={onFinding} />}
      <p className="lead-summary-footer">
        Synthetic demonstration material. Supports human investigation. The human underwriter makes
        the final decision.
      </p>
    </section>
  );
}
