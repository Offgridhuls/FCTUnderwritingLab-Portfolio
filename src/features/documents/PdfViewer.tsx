import { ChevronLeft, ChevronRight, Download, FileText, X } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type RenderTask } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import type { Citation, EvidenceDocument } from '../../../shared/types';
GlobalWorkerOptions.workerSrc = worker;
export function PdfViewer({
  document: d,
  citation,
  onClose,
  onReference,
}: {
  document: EvidenceDocument;
  citation?: Citation;
  onClose: () => void;
  onReference?: (c: Citation) => void;
}) {
  const [page, setPage] = useState(citation?.page || 1);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => setPage(citation?.page || 1), [d.id, citation]);
  useEffect(() => {
    let cancelled = false;
    let render: RenderTask | undefined;
    const task = getDocument({ url: `/api/v1/documents/${d.id}/file` });
    setError('');
    void task.promise
      .then(async (pdf) => {
        const p = await pdf.getPage(page);
        if (cancelled) return;
        const viewport = p.getViewport({ scale: 1.35 });
        const c = canvas.current;
        if (!c) return;
        c.width = viewport.width;
        c.height = viewport.height;
        render = p.render({ canvas: c, viewport });
        await render.promise;
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      render?.cancel();
      void task.destroy();
    };
  }, [d.id, page]);
  return (
    <aside className="evidence-panel" aria-label="Evidence viewer">
      <div className="panel-heading">
        <span>
          <FileText size={16} /> EVIDENCE VIEWER
        </span>
        <button className="icon-button" aria-label="Close evidence viewer" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <h3>{d.title}</h3>
      <div className="page-controls">
        <button
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          Page {page} of {d.pages.length}
        </span>
        <button
          aria-label="Next page"
          disabled={page === d.pages.length}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight size={16} />
        </button>
        <a
          aria-label="Download PDF"
          href={`/api/v1/documents/${d.id}/file`}
          download={`${d.id}.pdf`}
        >
          <Download size={16} />
        </a>
      </div>
      {error && <p className="error">{error}</p>}
      <canvas ref={canvas} aria-label={`${d.title}, page ${page}`} />
      {citation && (
        <div className="quote">
          <span className="eyebrow">CITED PASSAGE · PAGE {citation.page}</span>
          <blockquote>“{citation.quote}”</blockquote>
          <small>
            {citation.verified === false
              ? 'Citation could not be verified.'
              : 'Quotation matched to supplied evidence. This does not establish correctness.'}
          </small>
        </div>
      )}
      {onReference && (
        <button
          className="secondary"
          style={{ marginTop: 14, width: '100%' }}
          disabled={!d.pages[page - 1]?.trim()}
          onClick={() =>
            onReference({
              documentId: d.id,
              page,
              quote: d.pages[page - 1].slice(0, 1200),
              verified: true,
            })
          }
        >
          Use this page as challenge evidence
        </button>
      )}
      <details className="page-text">
        <summary>Accessible page text</summary>
        <p>{d.pages[page - 1] || 'No readable text on this page.'}</p>
      </details>
      {d.warnings.map((w) => (
        <p className="warning" key={w}>
          {w}
        </p>
      ))}
    </aside>
  );
}
