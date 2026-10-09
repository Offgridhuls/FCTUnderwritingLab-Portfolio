import { Background, Controls, ReactFlow } from '@xyflow/react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  List,
  Network,
  ShieldCheck,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  isActionableFinding,
  roleNames,
  roles,
  type Citation,
  type EvidenceDocument,
  type Finding,
  type Review,
  type Role,
  type Workspace,
} from '../../../shared/types';
import { LeadSummary } from '../reviews/LeadSummary';
import { BoardNode } from './BoardNode';
import { reviewerBoard } from './reviewerBoard';
const nodeTypes = { case: BoardNode };
interface Props {
  workspace: Workspace;
  review?: Review;
  selected: Finding | null;
  isRunning: boolean;
  isClosed: boolean;
  detailsPending: boolean;
  onFinding: (finding: Finding) => void;
  onDocument: (document: EvidenceDocument) => void;
  onStart: () => void;
  cites: (citations: Citation[]) => ReactNode;
}
export function InvestigationView({
  workspace,
  review,
  selected,
  isRunning,
  isClosed,
  detailsPending,
  onFinding,
  onDocument,
  onStart,
  cites,
}: Props) {
  const [board, setBoard] = useState(true);
  const [findingReviewer, setFindingReviewer] = useState<Role | 'all'>('all');
  const openFindings = review?.findings.filter(isActionableFinding) || [];
  const reviewerOrder: Role[] = [...roles, 'lead'];
  const visibleReviewers = reviewerOrder.filter(
    (role) => findingReviewer === 'all' || role === findingReviewer,
  );
  const { nodes, edges } = reviewerBoard(
    review,
    visibleReviewers,
    isRunning,
    { ...workspace.case, address: workspace.snapshot.address || 'Address not confirmed' },
    workspace.branch.details,
  );

  return (
    <>
      <section className="board-section">
        <div className="section-heading">
          <div>
            <h2>Follow the evidence</h2>
            <p>
              Property → responsible reviewer → actionable findings. Each reviewer has a separate
              branch.
            </p>
          </div>
          <div className="segmented">
            <button
              className={board ? 'active' : ''}
              onClick={() => setBoard(true)}
              aria-label="Board view"
            >
              <Network size={16} />
              Board
            </button>
            <button
              className={!board ? 'active' : ''}
              onClick={() => setBoard(false)}
              aria-label="List view"
            >
              <List size={16} />
              List
            </button>
          </div>
        </div>
        <label className="reviewer-filter">
          Focus reviewer
          <select
            value={findingReviewer}
            onChange={(e) => setFindingReviewer(e.target.value as Role | 'all')}
          >
            <option value="all">All reviewers</option>
            {reviewerOrder.map((role) => (
              <option key={role} value={role}>
                {roleNames[role]}
              </option>
            ))}
          </select>
        </label>
        {board ? (
          <div className="case-board">
            <ReactFlow
              key={`${review?.id || 'ready'}-${findingReviewer}-${openFindings.length}`}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.08 }}
              minZoom={0.2}
              maxZoom={1.5}
              nodesDraggable={false}
              nodesConnectable={false}
              onNodeClick={(_, n) => {
                const f = review?.findings.find((f) => f.id === n.id);
                if (f) onFinding(f);
                else if (n.id.startsWith('reviewer-')) setFindingReviewer(n.data.reviewer as Role);
                else {
                  const id =
                    n.id === 'seller'
                      ? 'representative'
                      : n.id === 'mortgage'
                        ? workspace.snapshot.documents.some((d) => d.id === 'payout-updated')
                          ? 'payout-updated'
                          : 'payout'
                        : n.id === 'municipal'
                          ? 'municipal'
                          : 'agreement';
                  const d = workspace.snapshot.documents.find((d) => d.id === id);
                  if (d) onDocument(d);
                }
              }}
            >
              <Background color="#c9d5d2" gap={22} />
              <Controls showInteractive={false} />
            </ReactFlow>
            <div className="board-legend">
              <span className="legend-dot teal" />
              Transaction <span className="legend-dot amber" />
              Actionable finding <span>Click a reviewer to focus · Click a finding to inspect</span>
            </div>
          </div>
        ) : (
          <div className="list-alternative">
            {workspace.snapshot.documents.map((d) => (
              <button key={d.id} onClick={() => onDocument(d)}>
                <FileText size={18} />
                <span>
                  <strong>{d.title}</strong>
                  <small>
                    {d.pages.length} page{d.pages.length > 1 ? 's' : ''}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        )}
      </section>
      <LeadSummary
        onFinding={(f) => {
          onFinding(f);
        }}
        review={review}
        revision={workspace.branch.revision}
        updating={workspace.interventions.some(
          (i) => i.reviewId === review?.id && ['queued', 'processing'].includes(i.state),
        )}
        cites={cites}
      />
      <section className="findings-section">
        <div className="section-heading">
          <div>
            <h2>
              Findings by reviewer <span className="small-count">{openFindings.length}</span>
            </h2>
            <p>
              {review
                ? 'Grouped by responsible reviewer, with actionable items first.'
                : 'Start the team review to investigate this transaction.'}
            </p>
          </div>
        </div>
        {!review && (
          <div className="empty-state">
            <ShieldCheck size={26} />
            <h3>The evidence is ready. Your review is next.</h3>
            <p>
              {workspace.snapshot.documents.length} documents are on the table. The team will assess
              them independently, cross-review material issues, and prepare a brief.
            </p>
            <button
              className="text-button"
              disabled={isClosed || detailsPending || !workspace.snapshot.documents.length}
              onClick={() => onStart()}
            >
              Bring the team in <ArrowRight size={16} />
            </button>
          </div>
        )}
        {review &&
          visibleReviewers.map((role) => {
            const findings = review.findings
              .filter((f) => f.reviewer === role)
              .sort((a, b) => Number(isActionableFinding(b)) - Number(isActionableFinding(a)));
            const assessed = review.exchanges.some(
              (e) => e.reviewer === role && e.kind === 'review',
            );
            if (role === 'lead' && !findings.length) return null;
            return (
              <section
                className="reviewer-findings"
                key={role}
                aria-label={`${roleNames[role]} findings`}
              >
                <header>
                  <h3>{roleNames[role]}</h3>
                  <span>
                    {findings.filter(isActionableFinding).length} actionable ·{' '}
                    {findings.filter((f) => !isActionableFinding(f)).length} explained / closed
                  </span>
                </header>
                {!findings.length && (
                  <p>
                    {assessed
                      ? 'No findings reported by this reviewer. See the review summary for assessment limits.'
                      : 'Not assessed in this review yet.'}
                  </p>
                )}
                <div className="finding-grid">
                  {findings.map((f) => (
                    <button
                      className={`finding-card ${f.category === 'assessment_limit' ? 'limited' : ''} ${isActionableFinding(f) ? 'actionable' : 'clear'} ${selected?.id === f.id ? 'selected' : ''}`}
                      key={f.id}
                      onClick={() => onFinding(f)}
                    >
                      <div className="finding-card-top">
                        <span className="eyebrow">{roleNames[f.reviewer]}</span>
                        {isActionableFinding(f) ? <AlertTriangle size={17} /> : <Check size={17} />}
                      </div>
                      <h3>{f.title}</h3>
                      <p>{f.impact || f.explanation}</p>
                      {isActionableFinding(f) && (f.action || f.nextCheck) && (
                        <p className="card-action">
                          <strong>Next step:</strong> {f.action || f.nextCheck}
                        </p>
                      )}
                      <div className="finding-card-bottom">
                        <span>
                          {isActionableFinding(f)
                            ? f.requiresHumanReview
                              ? 'Human underwriter action'
                              : f.category === 'assessment_limit'
                                ? 'Action required · limitation'
                                : f.category === 'missing_document'
                                  ? 'Missing document'
                                  : 'Needs attention'
                            : 'Explained / resolved'}
                        </span>
                        <span>
                          {f.citations.length} source
                          {f.citations.length === 1 ? '' : 's'} <ArrowUpRight size={13} />
                        </span>
                      </div>
                      {f.validationWarnings.length > 0 && (
                        <small className="error">Citation check failed</small>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
      </section>
    </>
  );
}
