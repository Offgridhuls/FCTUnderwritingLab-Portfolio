import { Download, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Citation, Finding, Review, Workspace } from '../../../shared/types';
import { LeadSummary } from '../reviews/LeadSummary';
interface Props {
  workspace: Workspace;
  review?: Review;
  branchId: string;
  isClosed: boolean;
  busy: boolean;
  note: string;
  setNote: (value: string) => void;
  cites: (citations: Citation[]) => ReactNode;
  onFinding: (finding: Finding) => void;
  onSave: () => void;
}
export function NotesView({
  workspace,
  review,
  branchId,
  isClosed,
  busy,
  note,
  setNote,
  cites,
  onFinding,
  onSave,
}: Props) {
  return (
    <section className="brief-layout">
      <div>
        <div className="section-heading">
          <div>
            <h2>The lead’s brief</h2>
            <p>A starting point for a human decision.</p>
          </div>
          <a className="secondary" href={`/api/v1/branches/${branchId}/export`}>
            <Download size={16} />
            Export Markdown
          </a>
        </div>
        <LeadSummary
          onFinding={onFinding}
          review={review}
          revision={workspace.branch.revision}
          updating={workspace.interventions.some(
            (i) => i.reviewId === review?.id && ['queued', 'processing'].includes(i.state),
          )}
          cites={cites}
        />
      </div>
      <div className="notes">
        <h3>Your investigation notes</h3>
        <p>Notes stay separate from verified evidence.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <textarea
            aria-label="Human note"
            placeholder="What should the human underwriter check next?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            maxLength={10000}
          />
          <button className="secondary" disabled={isClosed || busy || !note.trim()}>
            <Plus size={15} />
            Save note
          </button>
        </form>
        {workspace.notes.map((n) => (
          <div className="saved-note" key={n.id}>
            <small>{new Date(n.createdAt).toLocaleString()}</small>
            <p>{n.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
