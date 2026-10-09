import { ArrowUpRight, FileText, Plus, Search, Upload } from 'lucide-react';
import { useState } from 'react';
import type { EvidenceDocument, Workspace } from '../../../shared/types';
interface Props {
  workspace: Workspace;
  isClosed: boolean;
  busy: boolean;
  onUpload: () => void;
  onDocument: (document: EvidenceDocument) => void;
  onReveal: (id: string) => void;
}
export function DocumentsView({
  workspace,
  isClosed,
  busy,
  onUpload,
  onDocument,
  onReveal,
}: Props) {
  const [search, setSearch] = useState('');
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Evidence library</h2>
          <p>Text-based PDFs · page-level references · immutable review snapshots</p>
        </div>
        <button className="secondary" disabled={isClosed} onClick={() => onUpload()}>
          <Upload size={16} />
          Add or replace PDF
        </button>
      </div>
      <div className="search-box">
        <Search size={17} />
        <input
          aria-label="Search documents"
          placeholder="Find a document…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="document-table">
        {workspace.snapshot.documents
          .filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
          .map((d) => (
            <button key={d.id} onClick={() => onDocument(d)}>
              <span className="pdf-icon">
                <FileText size={23} />
                PDF
              </span>
              <span>
                <strong>{d.title}</strong>
                <small>
                  {d.kind.replaceAll('-', ' ')}
                  {d.warnings.length ? ' · unreadable pages flagged' : ' · text available'}
                </small>
              </span>
              <span>
                {d.pages.length} page{d.pages.length === 1 ? '' : 's'}
              </span>
              <ArrowUpRight size={18} />
            </button>
          ))}
      </div>
      {workspace.case.template !== 'blank' && (
        <div className="reveal-box">
          <span className="eyebrow">PREPARED EVIDENCE REVEALS</span>
          <h3>What if the missing evidence arrives?</h3>
          <p>
            Adding a document creates a new case revision and requires a full review. Branch first
            to preserve a side-by-side scenario.
          </p>
          <div>
            {workspace.reveals.map((d) => (
              <button
                key={d.id}
                className="secondary"
                disabled={isClosed || busy}
                onClick={() => onReveal(d.id)}
              >
                <Plus size={15} />
                {d.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
