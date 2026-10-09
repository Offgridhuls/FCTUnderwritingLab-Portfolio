import { Check, Clock, MessageSquare, Play } from 'lucide-react';
import { roleNames, roles, type Intervention, type Review, type Role } from '../../../shared/types';
const stages = ['Independent review', 'Cross-review', 'Responses', 'Lead brief'];
const questions = {
  ownership: [
    'Do the supplied records identify the same seller and property?',
    'What establishes the representative’s authority?',
  ],
  mortgage: [
    'Is the payout valid on the proposed closing date?',
    'Do the payout and lender instructions refer to the same transaction?',
  ],
  property: [
    'What does the municipal notice actually establish?',
    'Does later evidence resolve its scope and status?',
  ],
  identity: [
    'Is the name variation explained by supplied evidence?',
    'What verification remains outside these documents?',
  ],
  survey: [
    'Is usable survey or boundary evidence supplied?',
    'Do the text records establish an encroachment or only an unresolved question?',
  ],
  fraud: [
    'Is there a concrete unexplained contradiction?',
    'What independent check would distinguish an innocent explanation from a material indicator?',
  ],
  lead: ['Which gaps and disagreements remain?', 'What should the human underwriter check next?'],
};
export function ReviewProgress({
  review: r,
  interventions,
  onRun,
  runDisabled = false,
  leadDisabled = false,
}: {
  review?: Review;
  interventions: Intervention[];
  onRun?: (role: Role) => void;
  runDisabled?: boolean;
  leadDisabled?: boolean;
}) {
  const pending = interventions.filter(
    (i) => i.reviewId === r?.id && ['queued', 'processing'].includes(i.state),
  );
  const processing = pending.find((i) => i.state === 'processing');
  const terminal = !!r && ['failed', 'cancelled', 'interrupted'].includes(r.status);
  const waitingForWorker = r?.stageName === 'Waiting to start';
  return (
    <section className="review-progress" aria-label="Review progress">
      <ol className="stage-track">
        {stages.map((name, index) => {
          const skipped = !!r && r.mode !== 'cross' && (index === 1 || index === 2);
          const done = !!r && (r.stage > index || r.status === 'completed');
          const active = !!r && r.stage === index && r.status === 'running' && !waitingForWorker;
          const state = skipped
            ? 'Not used'
            : done
              ? 'Completed'
              : active
                ? 'Active'
                : terminal && r!.stage === index
                  ? 'Incomplete'
                  : r?.status === 'paused' && r.stage === index
                    ? 'Paused before stage'
                    : 'Waiting';
          return (
            <li
              key={name}
              className={active ? 'active' : done ? 'done' : ''}
              aria-current={active ? 'step' : undefined}
            >
              <span>{done ? <Check size={13} /> : index + 1}</span>
              <div>
                <strong>{name}</strong>
                <small>{state}</small>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="specialist-progress">
        {[...roles, 'lead' as const].map((role) => {
          const activity = r?.activities?.filter((a) => a.reviewer === role).at(-1);
          const sameStage = activity?.stage === r?.stage;
          const working = activity?.state === 'running' && !terminal;
          const done = activity?.state === 'completed';
          const unassigned =
            r?.mode === 'specialist' && role !== r.selectedReviewer && role !== 'lead';
          const state = unassigned
            ? 'Not assessed'
            : working
              ? 'Working'
              : activity?.state === 'failed'
                ? 'Call failed'
                : activity?.state === 'interrupted'
                  ? 'Interrupted'
                  : terminal && activity?.state === 'running'
                    ? 'Stopped'
                    : done
                      ? sameStage || r?.status === 'completed'
                        ? 'Finished'
                        : 'Previous stage finished'
                      : r?.status === 'completed'
                        ? 'Not in saved team'
                        : 'Waiting';
          return (
            <article key={role} className={working ? 'working' : ''}>
              <div>
                <strong>{roleNames[role]}</strong>
                <div className="reviewer-card-actions">
                  <button
                    type="button"
                    className="reviewer-run"
                    aria-label={`Run ${roleNames[role]}`}
                    title={
                      role === 'lead'
                        ? 'Rebuild the brief from a completed, current review'
                        : `Run ${roleNames[role]} and a scoped lead summary`
                    }
                    disabled={!onRun || runDisabled || (role === 'lead' && leadDisabled)}
                    onClick={() => onRun?.(role)}
                  >
                    <Play size={12} aria-hidden="true" />
                  </button>
                  <span className={working ? 'running' : ''}>
                    {working ? <Clock size={12} /> : done ? <Check size={12} /> : null}
                    {state}
                  </span>
                </div>
              </div>
              <small>
                {unassigned
                  ? 'Outside selected scope'
                  : activity
                    ? activity.label
                    : r
                      ? 'No call started yet'
                      : 'Ready to review'}
              </small>
              <details>
                <summary>Questions guiding this review</summary>
                <p className="checklist-label">
                  Review checklist · answers appear with completed findings
                </p>
                <ul>
                  {questions[role].map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </details>
            </article>
          );
        })}
      </div>
      <div className="challenge-timing" role="status">
        <MessageSquare size={16} />
        <div>
          {processing ? (
            <>
              <strong>Processing your challenge</strong>
              <p>
                The responsible specialist responds first, then the lead updates the brief.{' '}
                {pending.length > 1 ? `${pending.length - 1} more queued.` : ''}
              </p>
            </>
          ) : pending.length ? (
            <>
              <strong>
                {pending.length} challenge{pending.length === 1 ? '' : 's'} queued
              </strong>
              <p>
                {r?.status === 'running'
                  ? `The team will finish ${stages[r.stage] || r.stageName}, then pause to process your challenge. No interruption mid-stage.`
                  : 'Your challenge will be processed when the current intervention finishes.'}
              </p>
            </>
          ) : r?.status === 'paused' ? (
            <>
              <strong>Review paused at a completed stage boundary</strong>
              <p>
                {r.stage >= 4
                  ? 'All stages are finished. Resume to mark the review complete.'
                  : `Resume when ready to start ${stages[r.stage]}.`}
              </p>
            </>
          ) : r?.pauseRequested && r.status === 'running' ? (
            <>
              <strong>Pause requested</strong>
              <p>The team will pause after {stages[r.stage]} completes.</p>
            </>
          ) : (
            <>
              <strong>Human challenges are handled one at a time</strong>
              <p>
                {r?.status === 'running'
                  ? `A challenge submitted now will be handled after ${stages[r.stage]} completes.`
                  : 'Select a finding to ask a question or introduce a cited challenge.'}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
