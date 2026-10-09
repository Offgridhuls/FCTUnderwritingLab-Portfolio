import { useEffect, useRef, useState } from 'react';
import type { ComparisonResult, TopicSide } from '../../../shared/comparison';
import {
  isActionableFinding,
  roleNames,
  roles,
  type Citation,
  type Finding,
  type Review,
  type Workspace,
} from '../../../shared/types';
import { api } from '../../api';
import {
  outcomeLabels,
  outcomeOrder,
  readableField,
  reviewScope,
  shortStatus,
  visibleTopic,
} from './comparisonPresentation';

export function BranchComparison({
  workspace: w,
  onFinding,
  onCitation,
}: {
  workspace: Workspace;
  onFinding: (r: Review, f: Finding) => void;
  onCitation: (r: Review, c: Citation) => void;
}) {
  const [before, setBefore] = useState(''),
    [after, setAfter] = useState('');
  const [beforeReview, setBeforeReview] = useState(''),
    [afterReview, setAfterReview] = useState('');
  const [data, setData] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [all, setAll] = useState(false),
    [reviewer, setReviewer] = useState(''),
    [outcome, setOutcome] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const selectedBeforeId = data?.left?.id;
  const selectedAfterId = data?.right?.id;
  const effectiveReviews = useRef('');
  useEffect(() => {
    if (!data) return;
    const selection = `${selectedBeforeId || ''}:${selectedAfterId || ''}`;
    if (selection !== effectiveReviews.current) {
      effectiveReviews.current = selection;
      setExpanded(new Set());
    }
  }, [selectedBeforeId, selectedAfterId]);
  useEffect(() => {
    const child = w.branches
      .filter((b) => b.parentId === w.branch.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setBefore(w.branch.parentId || w.branch.id);
    setAfter(w.branch.parentId ? w.branch.id : child?.id || '');
    setBeforeReview('');
    setAfterReview('');
  }, [w.case.id, w.branch.id]);
  useEffect(() => {
    setExpanded(new Set());
    setOutcome('');
  }, [before, after, beforeReview, afterReview]);
  const signature = JSON.stringify([
    w.branches.map((b) => [b.id, b.revision]),
    w.reviews,
    w.interventions,
  ]);
  useEffect(() => {
    let cancelled = false,
      inflight = false;
    setData(null);
    setError('');
    if (!before || !after || before === after) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = new URLSearchParams({
      left: before,
      right: after,
      ...(beforeReview ? { beforeReviewId: beforeReview } : {}),
      ...(afterReview ? { afterReviewId: afterReview } : {}),
    });
    const fetchComparison = () => {
      if (inflight) return;
      inflight = true;
      void api<ComparisonResult>('/comparisons?' + q)
        .then((r) => {
          if (!cancelled) {
            setData(r);
            setError('');
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        })
        .finally(() => {
          inflight = false;
          if (!cancelled) setLoading(false);
        });
    };
    fetchComparison();
    const timer = setInterval(fetchComparison, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [before, after, beforeReview, afterReview, retry, signature]);
  const cite = (r: Review, c: Citation, i: number, label: string) => (
    <button
      key={i}
      className={c.verified === false ? 'invalid' : ''}
      onClick={() => onCitation(r, c)}
    >
      {label}:{' '}
      {r.snapshot.documents.find((d) => d.id === c.documentId)?.title || 'Unavailable document'} ·
      p.{c.page}
      {c.verified === false ? ' · Unverified' : ''}
    </button>
  );
  const finding = (r: Review, f: Finding, action = false) => (
    <div key={f.id} className="compare-finding">
      <button onClick={() => onFinding(r, f)}>View finding: {f.title}</button>
      {action && <p>{f.action || f.nextCheck}</p>}
    </div>
  );
  const side = (s: TopicSide, r: Review | undefined, label: string, branch: string) => {
    const evidence = [
      ...s.citations,
      ...s.findings.flatMap((f) => f.citations),
      ...s.limitations.flatMap((f) => f.citations),
    ].filter(
      (c, i, list) =>
        list.findIndex(
          (x) => x.documentId === c.documentId && x.page === c.page && x.quote === c.quote,
        ) === i,
    );
    return (
      <section className="topic-side" aria-label={label + ' assessment'}>
        <h5>
          {label} · {branch}
        </h5>
        <p className="compare-side-status">{shortStatus[s.status] || s.status}</p>
        <p>{s.explanation || 'No saved explanation available.'}</p>
        {r && (
          <>
            {s.findings.map((f) => finding(r, f))}
            {!!s.limitations.length && (
              <details>
                <summary>Verification limitations ({s.limitations.length})</summary>
                {s.limitations.map((f) => finding(r, f, true))}
              </details>
            )}
            <h5>{label} evidence</h5>
            <div className="citations">
              {evidence.length ? (
                evidence.map((c, i) => cite(r, c, i, label))
              ) : (
                <p>No source references recorded for this topic.</p>
              )}
            </div>
          </>
        )}
        {!!s.reasons.length && (
          <div className="compare-limits">
            <h5>{label} comparison limits</h5>
            <ul>
              {[...new Set(s.reasons)].map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  };
  const visible = data?.topics.filter((t) => visibleTopic(t, all, reviewer, outcome)) || [];
  const metadata = (r: Review | undefined) =>
    r ? (
      <p className="comparison-meta">
        {new Date(r.createdAt).toLocaleString()} · Evidence revision {r.revision}
        <br />
        {reviewScope(r)}
        {r.mode === 'specialist' && r.selectedReviewer
          ? ' · ' + roleNames[r.selectedReviewer]
          : ''}{' '}
        · {r.status} · Coverage {r.coverageStatus || 'not recorded'}
      </p>
    ) : (
      <p className="comparison-meta">No saved assessment selected.</p>
    );
  return (
    <section className="branch-comparison" aria-label="Branch comparison">
      <div className="comparison-controls">
        {(['Before', 'After'] as const).map((label) => {
          const left = label === 'Before';
          return (
            <div key={label}>
              <label>
                {label} branch
                <select
                  aria-label={label + ' branch'}
                  value={left ? before : after}
                  onChange={(e) => {
                    if (left) {
                      setBefore(e.target.value);
                      setBeforeReview('');
                    } else {
                      setAfter(e.target.value);
                      setAfterReview('');
                    }
                  }}
                >
                  <option value="">Choose a branch</option>
                  {w.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              {metadata(left ? data?.left : data?.right)}
            </div>
          );
        })}
      </div>
      <details className="comparison-review-picker">
        <summary>Choose reviews</summary>
        <p>
          Automatic selection uses a completed full-scope review of the current evidence when
          available. Otherwise the comparison is provisional.
        </p>
        <div className="comparison-controls">
          {(['Before', 'After'] as const).map((label) => {
            const left = label === 'Before';
            return (
              <label key={label}>
                {label} review
                <select
                  aria-label={label + ' review'}
                  value={left ? beforeReview : afterReview}
                  onChange={(e) => (left ? setBeforeReview : setAfterReview)(e.target.value)}
                >
                  <option value="">Automatic selection</option>
                  {(left ? data?.beforeReviews : data?.afterReviews)?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.createdAt).toLocaleString()} · revision {r.revision} ·{' '}
                      {reviewScope(r)}
                      {r.selectedReviewer ? ' · ' + roleNames[r.selectedReviewer] : ''} · {r.status}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </details>
      {!after && <p>Select a second branch to compare.</p>}
      {before === after && before && <p role="alert">Select two different branches.</p>}
      {loading && <p role="status">Loading comparison…</p>}
      {error && (
        <div role="alert">
          {error}
          <button onClick={() => setRetry((x) => x + 1)}>Retry comparison</button>
        </div>
      )}
      {data && (
        <>
          {data.incomplete && (
            <details className="comparison-provisional">
              <summary>
                Provisional comparison · Some assessments cannot be compared reliably
              </summary>
              <ul>
                {[...new Set(data.reasons)].map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p>Topic-specific reasons appear inside each topic.</p>
            </details>
          )}
          <h3>Comparison at a glance</h3>
          <div className="comparison-counts" aria-label="Filter by comparison outcome">
            {outcomeOrder.map((key) => (
              <button
                key={key}
                aria-pressed={outcome === key}
                className={'comparison-count outcome-' + key}
                onClick={() => {
                  setOutcome(outcome === key ? '' : key);
                  setAll(true);
                }}
              >
                <strong>{data.topics.filter((t) => t.outcome === key).length}</strong>
                <span>{outcomeLabels[key]}</span>
                <small>topics</small>
              </button>
            ))}
          </div>
          <p className="comparison-caption">
            Addressed within the supplied evidence; separate verification work may remain.
          </p>
          <div className="comparison-filters">
            <label>
              Topics
              <select
                aria-label="Topic visibility"
                value={all ? 'all' : 'open'}
                onChange={(e) => {
                  setAll(e.target.value === 'all');
                  setOutcome('');
                }}
              >
                <option value="open">Changes and open work</option>
                <option value="all">All topics</option>
              </select>
            </label>
            <label>
              Reviewer
              <select
                aria-label="Comparison reviewer"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
              >
                <option value="">All reviewers</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {roleNames[role]}
                  </option>
                ))}
              </select>
            </label>
            {outcome && (
              <button className="secondary" onClick={() => setOutcome('')}>
                Clear outcome filter
              </button>
            )}
          </div>
          <p className="comparison-visible" role="status">
            Showing {visible.length} of {data.topics.length} topics
            {outcome ? ' · ' + outcomeLabels[outcome as keyof typeof outcomeLabels] : ''}. Counts
            above cover the full comparison.
          </p>
          {!data.topics.some((t) => t.changed) && (
            <p>
              No substantive topic status changes. Remaining open work is listed below when it
              matches your filters.
            </p>
          )}
          {!visible.length && (
            <p>No topics match this view. Select All topics or change the filters.</p>
          )}
          {outcomeOrder.map((key) => {
            const topics = visible.filter((t) => t.outcome === key);
            return (
              !!topics.length && (
                <section
                  className="comparison-outcome-group"
                  key={key}
                  aria-label={outcomeLabels[key] + ' topics'}
                >
                  <h3>
                    {outcomeLabels[key]} <span>{topics.length}</span>
                  </h3>
                  {topics.map((t) => {
                    const open = expanded.has(t.id);
                    const actions = [...t.after.findings, ...t.after.limitations]
                      .filter(isActionableFinding)
                      .filter((f, i, list) => list.findIndex((x) => x.id === f.id) === i);
                    return (
                      <article className={'comparison-topic outcome-' + key} key={t.id}>
                        <button
                          className="comparison-topic-toggle"
                          aria-expanded={open}
                          aria-controls={'compare-topic-' + t.id}
                          onClick={() =>
                            setExpanded((previous) => {
                              const next = new Set(previous);
                              if (next.has(t.id)) next.delete(t.id);
                              else next.add(t.id);
                              return next;
                            })
                          }
                        >
                          <span className="comparison-topic-title">
                            <strong>{t.label}</strong>
                            <small>{roleNames[t.reviewer]}</small>
                          </span>
                          <span className="comparison-transition">
                            Before: {shortStatus[t.before.status] || t.before.status}
                            <span aria-hidden="true"> → </span>
                            <span className="sr-only"> to </span>After:{' '}
                            {shortStatus[t.after.status] || t.after.status}
                          </span>
                          <span className="comparison-topic-outcome">
                            <span>{outcomeLabels[key]}</span>
                            {key === 'addressed' &&
                              t.after.limitations.some(isActionableFinding) && (
                                <small>Human follow-up remains</small>
                              )}
                          </span>
                          <span aria-hidden="true">{open ? '−' : '+'}</span>
                        </button>
                        {open && (
                          <div className="comparison-topic-detail" id={'compare-topic-' + t.id}>
                            {t.before.status !== t.after.status &&
                              [t.before.status, t.after.status].includes('not_applicable') && (
                                <p className="warning">
                                  Applicability changed; this does not establish that a defect was
                                  cured.
                                </p>
                              )}
                            <div className="comparison-sides">
                              {side(t.before, data.left, 'Before', data.beforeBranch.name)}
                              {side(t.after, data.right, 'After', data.afterBranch.name)}
                            </div>
                            <section className="comparison-next">
                              <h5>Next steps · After assessment</h5>
                              {data.right && actions.length ? (
                                actions.map((f) => finding(data.right!, f, true))
                              ) : (
                                <p>
                                  No actionable next steps recorded for this topic. This does not
                                  establish clearance.
                                </p>
                              )}
                            </section>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              )
            );
          })}
          <details className="comparison-evidence">
            <summary>
              Documents and details changed · {data.evidence.added.length} added ·{' '}
              {data.evidence.removed.length} removed · {data.evidence.newlyCited.length} newly cited
            </summary>
            <p>
              Differences between the selected review snapshots. Added or newly cited evidence does
              not by itself prove a resolution.
            </p>
            {(['added', 'removed', 'newlyCited'] as const).map((k) => (
              <div key={k}>
                <h4>
                  {k === 'added'
                    ? 'Added documents'
                    : k === 'removed'
                      ? 'Removed documents'
                      : 'Newly cited documents'}
                </h4>
                {data.evidence[k].length ? (
                  <ul>
                    {data.evidence[k].map((d) => (
                      <li key={d.id}>{d.title}</li>
                    ))}
                  </ul>
                ) : (
                  <p>None recorded.</p>
                )}
              </div>
            ))}
            <h4>Working details</h4>
            {data.details.length ? (
              data.details.map((d) => (
                <p key={d.field}>
                  <strong>{readableField(d.field)}:</strong> {String(d.before ?? 'Unknown')} →{' '}
                  {String(d.after ?? 'Unknown')}
                </p>
              ))
            ) : (
              <p>No changes recorded.</p>
            )}
            <h4>Branch assumptions</h4>
            <p>Before: {data.assumptions.before.join('; ') || 'None supplied'}</p>
            <p>After: {data.assumptions.after.join('; ') || 'None supplied'}</p>
          </details>
          {(data.unmapped.before.length > 0 || data.unmapped.after.length > 0) && (
            <details className="comparison-evidence">
              <summary>
                Findings not mapped to a topic · {data.unmapped.before.length} Before ·{' '}
                {data.unmapped.after.length} After
              </summary>
              <p>Excluded from topic totals. No matching is inferred from similar wording.</p>
              <div className="comparison-sides">
                <div>
                  <h4>Before</h4>
                  {data.left && data.unmapped.before.map((f) => finding(data.left!, f, true))}
                </div>
                <div>
                  <h4>After</h4>
                  {data.right && data.unmapped.after.map((f) => finding(data.right!, f, true))}
                </div>
              </div>
            </details>
          )}
          <p className="comparison-caption">
            Comparison of saved assessments, not approval to close or issue insurance.
          </p>
        </>
      )}
    </section>
  );
}
