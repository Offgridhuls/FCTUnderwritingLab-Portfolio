import { useEffect, useState } from 'react';
import type { Citation, DetailField, Workspace } from '../../../shared/types';
import { api } from '../../api';
const fields: Record<DetailField, string> = {
  seller: 'Seller',
  buyer: 'Buyer',
  address: 'Property address',
  parcel: 'Parcel identifier',
  purchasePrice: 'Purchase price (CAD)',
  loanAmount: 'Loan amount (CAD)',
  closingDate: 'Closing date',
};
export function CaseDetailsPanel({
  workspace: w,
  refresh,
  openCitation,
}: {
  workspace: Workspace;
  refresh: () => Promise<unknown>;
  openCitation: (c: Citation) => void;
}) {
  const details = w.branch.details;
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const field of Object.keys(fields) as DetailField[]) {
      const unique = [...new Set(details?.candidates[field]?.map((c) => c.value) || [])];
      next[field] = details?.confirmed
        ? details.values[field] || ''
        : unique.length === 1
          ? unique[0]
          : '';
    }
    setValues(next);
    setEditing(false);
    setError('');
  }, [w.branch.id, w.branch.revision]);
  if (!details) return null;
  const locked =
    w.case.status === 'finalized' ||
    busy ||
    w.reviews.some((r) => ['running', 'paused'].includes(r.status)) ||
    w.interventions.some((i) => ['queued', 'processing'].includes(i.state));
  if (details.confirmed && !editing)
    return (
      <section className="case-details-panel confirmed-details" aria-label="Case details">
        <div>
          <strong>Working details confirmed</strong>
          <small>
            {Object.keys(fields).filter((f) => !details.values[f as DetailField]).length} unknown
            fields ·{' '}
            {
              Object.values(details.candidates).filter(
                (c) => new Set(c?.map((x) => x.value)).size > 1,
              ).length
            }{' '}
            conflicting sources
          </small>
        </div>
        <button disabled={locked} onClick={() => setEditing(true)}>
          Edit details
        </button>
      </section>
    );
  return (
    <section className="case-details-panel" aria-label="Case details">
      <h2>{details.confirmed ? 'Confirmed working details' : 'Review extracted case details'}</h2>
      <p>
        {!w.snapshot.documents.length
          ? 'Upload relevant PDFs in Documents. Details will be extracted automatically.'
          : 'Suggestions come from clearly labelled text, not verified facts. Other wording may not be extracted. Select conflicting values or correct them. Blank fields are explicitly recorded as unknown. Confirming does not resolve conflicting evidence.'}
      </p>
      {!!w.snapshot.documents.length && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api(`/branches/${w.branch.id}/details`, {
                caseId: w.case.id,
                branchId: w.branch.id,
                expectedRevision: w.branch.revision,
                commandId: crypto.randomUUID(),
                values,
              });
              await refresh();
              setEditing(false);
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : 'The request failed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="case-details-grid">
            {(Object.keys(fields) as DetailField[]).map((field) => {
              const candidates = details.candidates[field] || [];
              const conflict = new Set(candidates.map((c) => c.value)).size > 1;
              return (
                <div key={field} className={conflict ? 'detail-conflict' : ''}>
                  <label>
                    {fields[field]}
                    <input
                      disabled={locked}
                      type={field === 'closingDate' ? 'date' : 'text'}
                      value={values[field] || ''}
                      maxLength={300}
                      placeholder="Unknown / not found"
                      onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                    />
                  </label>
                  <small>
                    {conflict
                      ? 'Conflicting values: choose a working value; verify the underlying records.'
                      : !candidates.length
                        ? 'Not extracted. Enter a value or leave unknown.'
                        : 'Extracted suggestion. Check the source.'}
                  </small>
                  {details.confirmed && (
                    <p className="detail-origin">
                      Saved as:{' '}
                      {details.origins[field] === 'user'
                        ? 'user correction (unverified)'
                        : details.origins[field] === 'document'
                          ? 'document-derived, user confirmed'
                          : 'unknown'}
                    </p>
                  )}
                  {candidates.map((c, i) => (
                    <div className="detail-candidate" key={i}>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => setValues({ ...values, [field]: c.value })}
                      >
                        {c.value}
                      </button>
                      <button
                        type="button"
                        onClick={() => openCitation(c.citation)}
                        aria-label={`Source for ${fields[field]} ${i + 1}`}
                      >
                        p.{c.citation.page} ·{' '}
                        {w.snapshot.documents.find((d) => d.id === c.citation.documentId)?.title}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={locked}>
            {busy
              ? 'Saving…'
              : details.confirmed
                ? 'Save changes'
                : 'Confirm details (blanks remain unknown)'}
          </button>
          {details.confirmed && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setValues({ ...details.values });
                setError('');
                setEditing(false);
              }}
            >
              Cancel
            </button>
          )}
        </form>
      )}
    </section>
  );
}
