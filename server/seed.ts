import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { EvidenceDocument } from '../shared/types.js';
export const RULES_VERSION = 'DEMO-ONTARIO-1.0';
export const RULES = `DEMONSTRATION RULES ONLY. Not FCT underwriting rules or legal advice.
R1: Supplied authority must connect a seller representative, seller, property and transaction. Missing evidence is a documentation gap, not evidence of fraud.
R2: A mortgage payout must be valid through the proposed closing date. Use provided deterministic comparisons; do not calculate dates or money yourself.
R3: An open municipal notice needs clarification of scope and current status. Do not infer a defect, coverage outcome or contravention from a notice alone.
R4: An explained name variation is not an accusation or fraud indicator. Supplied identity summaries do not authenticate a real identity.
R5: A human assertion is unverified without cited documentary support. Hypothetical branch assumptions are never verified evidence.
R6: Quote only supplied pages, cite exact document IDs and 1-based pages. A missing document has no invented citation: cite the request/correspondence establishing the gap.
R7: Withdraw a gap only when the supplied evidence addresses it. Preserve unresolved contradictory evidence and limitations. No insurance decisions.`;
export const specs = [
  {
    id: 'agreement',
    title: 'Agreement of Purchase and Sale',
    kind: 'agreement',
    pages: [
      `SYNTHETIC TRANSACTION - 18 Alder Lane, Kingston, Ontario\nBuyer: Alex Chen. Seller: Morgan Ellis.\nPurchase price: CAD 700,000. Proposed closing: 2026-10-15.\nProperty identifier: DEMO-PIN-001. Residential freehold purchase.\nJordan Vale corresponds as seller representative. Representative authority is to be supplied before closing.`,
    ],
  },
  {
    id: 'title',
    title: 'Parcel Register Extract',
    kind: 'title',
    pages: [
      `SYNTHETIC PARCEL REGISTER - DEMO-PIN-001\n18 Alder Lane, Kingston, Ontario. Registered owner: Morgan A. Ellis.\nCharge DEMO-CH-100: Cedar Bank mortgage, principal originally CAD 420,000.\nNo other registered charge is shown in this prepared extract. This is a fictional snapshot, not a live land registry search.`,
    ],
  },
  {
    id: 'lender',
    title: 'Purchaser Lender Instructions',
    kind: 'lender',
    pages: [
      `SYNTHETIC LENDER INSTRUCTIONS\nBuyer: Alex Chen. New loan: CAD 500,000.\nClosing date: 2026-10-15. Existing Cedar Bank charge DEMO-CH-100 must be addressed with a current payout statement.\nAny proposed change to closing must be reconciled with lender instructions.`,
    ],
  },
  {
    id: 'payout',
    title: 'Cedar Bank Payout • October 12',
    kind: 'payout',
    pages: [
      `SYNTHETIC PAYOUT STATEMENT\nCharge: DEMO-CH-100. Property: 18 Alder Lane.\nPayout amount: CAD 381,250.00. Valid through: 2026-10-12.\nDo not extrapolate the amount beyond the validity date. Obtain an updated statement if closing occurs later.`,
    ],
  },
  {
    id: 'identity',
    title: 'Name Reconciliation Summary',
    kind: 'identity',
    pages: [
      `SYNTHETIC NAME RECONCILIATION\nThe seller shown as Morgan Ellis in the agreement is the same fictional person shown as Morgan A. Ellis on the parcel register.\nThe middle initial A is omitted in the agreement. Supplied name reconciliation explains this variation.\nThis prepared summary is evidence for this demonstration only; it does not perform identity authentication.`,
    ],
  },
  {
    id: 'representative',
    title: 'Representative Correspondence',
    kind: 'authority-request',
    pages: [
      `SYNTHETIC CORRESPONDENCE - 2026-10-02\nFrom: Jordan Vale, seller representative.\nI am arranging execution on behalf of Morgan Ellis for 18 Alder Lane. The supporting authorization is not yet included in the transaction package.\nPlease list authority documentation as outstanding until the supporting document is reviewed.`,
    ],
  },
  {
    id: 'municipal',
    title: 'Municipal Records Notice',
    kind: 'municipal',
    pages: [
      `SYNTHETIC MUNICIPAL NOTICE - FILE DEMO-M-22\n18 Alder Lane, Kingston, Ontario.\nA records review concerning a rear deck permit remains open pending clarification. The notice does not determine whether work is compliant or noncompliant.\nRequest current municipal clarification of status and scope before concluding this issue.`,
    ],
  },
  {
    id: 'authorization',
    title: 'Seller Representative Authorization',
    kind: 'authority',
    reveal: true,
    pages: [
      `SYNTHETIC AUTHORIZATION PACKAGE\nSeller: Morgan Ellis. Representative: Jordan Vale. Property: 18 Alder Lane; DEMO-PIN-001.\nThis package is prepared solely for the underwriting demonstration.`,
      `SYNTHETIC SCOPE SCHEDULE\nTransaction: sale of 18 Alder Lane to Alex Chen.\nThis schedule references the authority confirmation on page 3.`,
      `SYNTHETIC AUTHORITY CONFIRMATION\nMorgan Ellis authorizes Jordan Vale to execute the sale closing documents for 18 Alder Lane, DEMO-PIN-001, to Alex Chen on 2026-10-15.\nFor this fictional exercise, the supplied verification summary confirms the scope and current validity of this authorization. This does not authenticate real signatures.`,
    ],
  },
  {
    id: 'payout-updated',
    title: 'Updated Payout • October 20',
    kind: 'payout-update',
    reveal: true,
    pages: [
      `SYNTHETIC UPDATED PAYOUT STATEMENT\nCharge: DEMO-CH-100. Property: 18 Alder Lane.\nPayout amount: CAD 381,640.00. Valid through: 2026-10-20.\nThis statement supersedes the earlier payout valid through 2026-10-12 for the same charge.`,
    ],
  },
  {
    id: 'municipal-clear',
    title: 'Municipal Clarification',
    kind: 'municipal-clarification',
    reveal: true,
    pages: [
      `SYNTHETIC MUNICIPAL CLARIFICATION - FILE DEMO-M-22\n18 Alder Lane, Kingston, Ontario.\nThe rear deck records review is closed. No outstanding requirement remains under this notice as of 2026-10-08.\nThis clarification concerns DEMO-M-22 only and is not an inspection of the whole property.`,
    ],
  },
];
export async function seedDocuments(dir: string): Promise<EvidenceDocument[]> {
  await mkdir(dir, { recursive: true });
  const result: EvidenceDocument[] = [];
  for (const spec of specs) {
    const pdf = await PDFDocument.create();
    pdf.setTitle(spec.title);
    pdf.setAuthor('Fictional Underwriting Lab');
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    for (const [index, content] of spec.pages.entries()) {
      const page = pdf.addPage([612, 792]);
      page.drawRectangle({ x: 0, y: 706, width: 612, height: 86, color: rgb(0.09, 0.19, 0.21) });
      page.drawText('UNDERWRITING LAB / FICTIONAL EVIDENCE', {
        x: 42,
        y: 749,
        size: 10,
        font: bold,
        color: rgb(0.7, 0.87, 0.83),
      });
      page.drawText(spec.title.replace('•', '/'), {
        x: 42,
        y: 722,
        size: 17,
        font: bold,
        color: rgb(1, 1, 1),
      });
      let y = 670;
      for (const paragraph of content.split('\n')) {
        let line = '';
        for (const word of paragraph.split(' ')) {
          const next = line ? line + ' ' + word : word;
          if (font.widthOfTextAtSize(next, 11) > 520) {
            page.drawText(line, { x: 42, y, size: 11, font });
            y -= 18;
            line = word;
          } else line = next;
        }
        if (line) {
          page.drawText(line, { x: 42, y, size: 11, font });
          y -= 28;
        }
      }
      page.drawLine({
        start: { x: 42, y: 67 },
        end: { x: 570, y: 67 },
        thickness: 1,
        color: rgb(0.8, 0.84, 0.83),
      });
      page.drawText(
        `SYNTHETIC / NOT A LEGAL DOCUMENT                     ${spec.id} / PAGE ${index + 1}`,
        { x: 42, y: 45, size: 9, font, color: rgb(0.35, 0.4, 0.4) },
      );
    }
    const file = join(dir, spec.id + '.pdf');
    // Reuse seeded files: an open desktop PDF viewer can lock them on Windows.
    try {
      await access(file);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      await writeFile(file, await pdf.save(), { flag: 'wx' });
    }
    result.push({
      id: spec.id,
      title: spec.title,
      kind: spec.kind,
      pages: spec.pages,
      file,
      warnings: [],
      createdAt: new Date().toISOString(),
    });
  }
  return result;
}
