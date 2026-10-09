import { ArrowRight, FolderOpen, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CaseRecord } from '../../../shared/types';
import { api, ApiError } from '../../api';

function CaseHistoryDialog({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [record, setRecord] = useState<CaseRecord>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      trigger?.focus();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setError('');
    api<{ case: CaseRecord }>(`/cases/${caseId}`)
      .then((data) => {
        if (!cancelled) setRecord(data.case);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, retry]);
  const events = record
    ? [
        {
          action: 'created',
          at: record.createdAt,
          note: 'Investigation created. No opening reason was requested.',
        },
        ...(record.lifecycle || []),
      ].sort((a, b) => b.at.localeCompare(a.at))
    : [];
  return createPortal(
    <dialog
      ref={ref}
      className="case-dialog case-history-dialog"
      aria-labelledby="case-history-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
        <h2 id="case-history-title">Investigation history</h2>
        <button className="icon-button" aria-label="Close investigation history" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {error ? (
        <div role="alert">
          <p className="error">{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </div>
      ) : !record ? (
        <p role="status">Loading history…</p>
      ) : (
        <>
          <div className="case-dialog-name">
            <FolderOpen size={18} />
            <strong>{record.name}</strong>
          </div>
          <p className="modal-intro">Recorded openings and closures · Most recent first</p>
          <ol className="case-history-list">
            {events.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <div className="case-history-event">
                  <strong>
                    {event.action === 'created'
                      ? 'Investigation opened'
                      : event.action === 'reopened'
                        ? 'Investigation reopened'
                        : 'Investigation closed (finalized)'}
                  </strong>
                  <time dateTime={event.at}>
                    {new Date(event.at).toLocaleString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZoneName: 'short',
                    })}
                  </time>
                </div>
                <p>{event.note || 'No reason recorded.'}</p>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="modal-footer">
        <button onClick={onClose}>Close</button>
      </div>
    </dialog>,
    document.body,
  );
}

export function CaseDialog({
  target,
  onClose,
  onCreated,
  onUpdated,
  onStale,
}: {
  target: CaseRecord | 'new';
  onClose: () => void;
  onCreated: (branchId: string) => void;
  onUpdated: () => Promise<void>;
  onStale: (c: CaseRecord) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const retry = useRef<{ body: string; id: string } | null>(null);
  const closed = target !== 'new' && target.status === 'finalized';
  const title = target === 'new' ? 'New case' : closed ? 'Reopen case' : 'Finalize case';
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      trigger?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      className="case-dialog"
      ref={ref}
      aria-labelledby="case-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id="case-dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close case dialog"
          disabled={saving}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {target !== 'new' && (
        <div className="case-dialog-name">
          <FolderOpen size={18} />
          <strong>{target.name}</strong>
        </div>
      )}
      <p className="modal-intro">
        {target === 'new'
          ? 'Start with a name. Upload your documents next, then confirm the extracted details.'
          : closed
            ? 'Reopen this investigation to add evidence and run reviews. Existing history stays intact.'
            : 'This makes every branch read-only and preserves outstanding findings. It does not approve insurance or authorize closing. You can reopen the case later.'}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setSaving(true);
          setError('');
          const payload =
            target === 'new'
              ? { name: form.get('name') }
              : {
                  expectedVersion: target.version || 1,
                  status: closed ? 'open' : 'finalized',
                  note: form.get('note'),
                };
          const body = JSON.stringify(payload);
          if (retry.current?.body !== body) retry.current = { body, id: crypto.randomUUID() };
          try {
            const command = { ...payload, commandId: retry.current!.id };
            if (target === 'new') {
              const result = await api<{ branchId: string }>('/cases', command);
              onCreated(result.branchId);
            } else {
              await api(`/cases/${target.id}/status`, command);
              await onUpdated();
            }
            onClose();
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'The request failed.');
            if (e instanceof ApiError && e.status === 409 && target !== 'new') {
              try {
                const current = await api<{ case: CaseRecord }>(`/cases/${target.id}`);
                onStale(current.case);
              } catch {}
            }
          } finally {
            setSaving(false);
          }
        }}
      >
        {target === 'new' ? (
          <label>
            Case name
            <input
              name="name"
              autoFocus
              required
              maxLength={160}
              placeholder="e.g. 18 Alder Lane purchase"
            />
          </label>
        ) : (
          <label>
            {closed ? 'Reason for reopening' : 'Finalization note / outstanding handoff'}
            <textarea
              name="note"
              autoFocus
              required
              maxLength={3000}
              rows={4}
              placeholder={
                closed
                  ? 'What needs further investigation?'
                  : 'Record the outcome and any outstanding work.'
              }
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Saving…' : target === 'new' ? 'Create case' : title}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}

export function CasesPage({
  visible,
  refreshKey,
  onOpen,
  onAction,
  filter,
  setFilter,
  search,
  setSearch,
}: {
  filter: 'all' | 'open' | 'finalized';
  setFilter: (f: 'all' | 'open' | 'finalized') => void;
  search: string;
  setSearch: (s: string) => void;
  visible: boolean;
  refreshKey: number;
  onOpen: (c: CaseRecord) => void;
  onAction: (c: CaseRecord | 'new') => void;
}) {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [historyCaseId, setHistoryCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    api<CaseRecord[]>('/cases')
      .then((data) => {
        if (!cancelled) setCases(data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, refreshKey, retry]);
  const shown = cases.filter(
    (c) =>
      (filter === 'all' || (c.status || 'open') === filter) &&
      `${c.name} ${c.displayAddress || ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="cases-page" hidden={!visible} aria-label="Cases">
      <div className="cases-heading">
        <div>
          <div className="eyebrow">YOUR INVESTIGATIONS</div>
          <h1>Cases</h1>
          <p>Keep every transaction and its evidence in one place.</p>
        </div>
        <button className="primary" onClick={() => onAction('new')}>
          <Plus size={17} />
          New case
        </button>
      </div>
      <div className="cases-toolbar">
        <div className="cases-filters" role="group" aria-label="Case status filter">
          {(['all', 'open', 'finalized'] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
              <span>{cases.filter((c) => f === 'all' || (c.status || 'open') === f).length}</span>
            </button>
          ))}
        </div>
        <label className="cases-search">
          <Search size={17} />
          <input
            aria-label="Search cases"
            placeholder="Search cases or addresses"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {loading ? (
        <div className="cases-empty" role="status">
          Loading cases…
        </div>
      ) : error ? (
        <div className="cases-empty" role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </div>
      ) : !shown.length ? (
        <div className="cases-empty">
          <FolderOpen size={32} />
          <h2>
            {search ? 'No matching cases' : `No ${filter === 'all' ? '' : filter + ' '}cases`}
          </h2>
          <p>
            {search
              ? 'Try another name or address, or change the status filter.'
              : 'Create a case to start gathering evidence.'}
          </p>
        </div>
      ) : (
        <div className="cases-list">
          <div className="cases-columns" aria-hidden="true">
            <span>CASE / PROPERTY</span>
            <span>STATUS</span>
            <span>CREATED</span>
            <span />
          </div>
          {shown.map((c) => (
            <article className="case-row" key={c.id} aria-label={c.name}>
              <div className="case-row-identity">
                <span className="case-folder">
                  <FolderOpen size={21} />
                </span>
                <div>
                  <h2>{c.name}</h2>
                  <p>{c.displayAddress || 'Property not identified'}</p>
                </div>
              </div>
              <span className={`case-status ${c.status || 'open'}`}>
                <i />
                {c.status === 'finalized' ? 'Finalized' : 'Open'}
              </span>
              <time dateTime={c.createdAt}>
                {new Date(c.createdAt).toLocaleDateString('en-CA', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </time>
              <div className="case-row-actions">
                <button onClick={() => onOpen(c)}>
                  Open case
                  <ArrowRight size={15} />
                </button>
                <details
                  className="case-actions"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.currentTarget.open = false;
                      e.currentTarget.querySelector('summary')?.focus();
                    }
                  }}
                >
                  <summary aria-label={`Actions for ${c.name}`}>
                    <MoreHorizontal size={19} />
                  </summary>
                  <div>
                    <button
                      onClick={(e) => {
                        const menu = e.currentTarget.closest('details')!;
                        menu.open = false;
                        menu.querySelector('summary')?.focus();
                        setHistoryCaseId(c.id);
                      }}
                    >
                      View history
                    </button>
                    <button
                      onClick={(e) => {
                        e.currentTarget.closest('details')!.open = false;
                        onAction(c);
                      }}
                    >
                      {c.status === 'finalized' ? 'Reopen case' : 'Finalize case'}
                    </button>
                  </div>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="cases-footnote">
        Synthetic cases · Finalizing preserves the investigation; it does not approve coverage.
      </p>
      {historyCaseId && (
        <CaseHistoryDialog caseId={historyCaseId} onClose={() => setHistoryCaseId(null)} />
      )}
    </section>
  );
}
