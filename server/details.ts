import type { EvidenceDocument, CaseDetails, DetailField } from '../shared/types.js';

// Deliberately conservative label extraction. No guessing from names or document dates.
const labels: Record<DetailField, string> = {
  seller: '(?:Seller|Vendor|Registered owner)',
  buyer: '(?:Buyer|Purchaser|Borrower)',
  address: '(?:Property address|Security address|Property)',
  parcel: '(?:Property identifier|Parcel identifier|Parcel identifier number|PIN)',
  purchasePrice: '(?:Purchase price|Price)',
  loanAmount: '(?:New loan|Authorized advance|Loan amount)',
  closingDate: '(?:Proposed closing|Closing date|Authorized completion date|Completion)',
};
export function extractDetails(documents: EvidenceDocument[], revision: number): CaseDetails {
  const candidates: CaseDetails['candidates'] = {};
  for (const field of Object.keys(labels) as DetailField[]) {
    candidates[field] = [];
    for (const d of documents)
      for (const [index, page] of d.pages.entries()) {
        // Borrower means buyer only on purchaser-lender records, not on seller payouts.
        const label =
          field === 'buyer' && d.kind !== 'lender' ? '(?:Buyer|Purchaser)' : labels[field];
        const valuePattern =
          field === 'purchasePrice' || field === 'loanAmount'
            ? '(?:(?:CAD|\\$)\\s*)?([0-9][0-9,]*(?:\\.[0-9]{2})?)'
            : field === 'closingDate'
              ? '(\\d{4}-\\d{2}-\\d{2}|[A-Za-z]+ \\d{1,2},? \\d{4})'
              : '([^.;\\n]{2,160})';
        const regex = new RegExp('\\b' + label + '\\s*(?::|\\bis\\b)?\\s+' + valuePattern, 'gi');
        for (const match of page.matchAll(regex)) {
          let value = match[1].trim();
          if (['seller', 'buyer', 'address', 'parcel'].includes(field) && !/^[A-Z0-9]/.test(value))
            continue;
          if (field === 'purchasePrice' || field === 'loanAmount')
            value = String(Number(value.replaceAll(',', '')));
          if (field === 'closingDate') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              const m = value.match(/^([a-z]+) (\d{1,2}),? (\d{4})$/i);
              const months = [
                'january',
                'february',
                'march',
                'april',
                'may',
                'june',
                'july',
                'august',
                'september',
                'october',
                'november',
                'december',
              ];
              const month = m ? months.indexOf(m[1].toLowerCase()) + 1 : 0;
              if (!m || !month) continue;
              value = `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
            }
            const parsed = new Date(value + 'T00:00:00Z');
            if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
              continue;
          }
          // Retain distinct spellings and all source records, including conflicting drafts.
          if (
            !candidates[field]!.some(
              (c) =>
                c.value === value &&
                c.citation.documentId === d.id &&
                c.citation.page === index + 1,
            )
          )
            candidates[field]!.push({
              value,
              citation: { documentId: d.id, page: index + 1, quote: match[0], verified: true },
            });
        }
      }
  }
  return { revision, candidates, confirmed: false, values: {}, origins: {} };
}

export function inferDocumentKind(title: string, pages: string[]): string {
  const text = (title + ' ' + (pages[0] || '').slice(0, 700)).toLowerCase();
  if (/payout/.test(text))
    return /updated payout|payout update/.test(text) ? 'payout-update' : 'payout';
  if (/lender instruction/.test(text)) return 'lender';
  if (/purchase agreement|agreement of purchase/.test(text)) return 'agreement';
  if (/parcel.register|registry extract/.test(text)) return 'title';
  if (/municipal/.test(text)) return 'municipal';
  if (/representative authority|power of attorney/.test(text)) return 'authority-request';
  if (/identity|name.reconciliation/.test(text)) return 'identity';
  if (/survey/.test(text)) return 'survey';
  return 'uploaded';
}
