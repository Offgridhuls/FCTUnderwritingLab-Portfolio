export const roles = ['ownership', 'identity', 'mortgage', 'property', 'survey', 'fraud'] as const;
export type Role = (typeof roles)[number] | 'lead';
export const roleNames: Record<Role, string> = {
  ownership: 'Title & authority',
  identity: 'Identity',
  mortgage: 'Mortgages & liens',
  property: 'Permits & municipal',
  survey: 'Surveys & boundaries',
  fraud: 'Fraud indicators',
  lead: 'Lead reviewer',
};
export const roleScopes: Record<Role, string> = {
  ownership:
    'Compare registered ownership, property identifiers, legal descriptions, easements and representative authority. Own AUTHORITY and TITLE findings. Identity owns name reconciliation; mortgage owns charges and liens.',
  identity:
    'Compare party names and supplied identity/verification summaries. Own NAME_RECONCILIATION and IDENTITY findings. Explain innocent discrepancies. Supplied summaries do not authenticate identity; do not claim identity verification.',
  mortgage:
    'Review registered mortgages, other liens/charges, discharge evidence, payout validity and lender instructions. Own PAYOUT and LIEN findings. Use deterministic date and amount checks. A prepared extract is not a current or complete registry search.',
  property:
    'Review permits, municipal notices, work orders and supplied clarification. Own MUNICIPAL and PERMIT findings. A notice or absent permit is not by itself proof of unlawful work or a defect.',
  survey:
    'Review supplied text-based survey reports, boundary descriptions, encroachments and survey-related easements. Own SURVEY findings. Do not interpret drawings or infer boundaries from a street address. If no survey evidence exists, report not assessed in your summary; do not invent an encroachment or mandatory survey requirement.',
  fraud:
    "Assess only concrete documentary contradictions or suspicious transaction instructions. Own FRAUD_INDICATOR findings. Distinguish indicators from proof and recommend specific independent human verification when warranted. Missing authority, an explained name variation or absent documents alone are not fraud. Do not duplicate other specialists' documentation gaps as fraud findings; do not declare a transaction fraud-free.",
  lead: 'Consolidate all six specialist scopes for a human underwriter. Preserve disagreement, evidence limitations, unassessed areas and next checks. Never approve or deny insurance, clear a closing, authenticate identity or make the final underwriting decision.',
};
export interface Citation {
  documentId: string;
  page: number;
  quote: string;
  verified?: boolean;
}
export interface EvidenceDocument {
  id: string;
  title: string;
  kind: string;
  pages: string[];
  file: string;
  warnings: string[];
  createdAt: string;
}
export function isActionableFinding(f: Finding): boolean {
  return f.requiresHumanReview === true || (f.status === 'open' && f.severity !== 'clear');
}
export interface Finding {
  requiresHumanReview?: boolean;
  category?: 'issue' | 'missing_document' | 'assessment_limit';
  missingDocument?: string;
  impact?: string;
  action?: string;
  id: string;
  issueCode: string;
  reviewer: Role;
  title: string;
  severity: 'attention' | 'clarify' | 'clear';
  status: 'open' | 'resolved' | 'withdrawn';
  explanation: string;
  nextCheck: string;
  known?: string;
  uncertain?: string;
  changeEvidence?: string;
  reviewQuestions?: { question: string; answer: string; citations: Citation[] }[];
  citations: Citation[];
  validationWarnings: string[];
}
export type DetailField =
  'seller' | 'buyer' | 'address' | 'parcel' | 'purchasePrice' | 'loanAmount' | 'closingDate';
export interface CaseDetails {
  revision: number;
  candidates: Partial<Record<DetailField, { value: string; citation: Citation }[]>>;
  confirmed: boolean;
  values: Partial<Record<DetailField, string>>;
  origins: Partial<Record<DetailField, 'document' | 'user' | 'unknown'>>;
}
export interface Snapshot {
  details?: CaseDetails;
  caseName?: string;
  address?: string;
  caseId: string;
  branchId: string;
  revision: number;
  closingDate: string;
  purchasePrice: number;
  loanAmount: number;
  assumptions: string[];
  documents: EvidenceDocument[];
  rulesVersion: string;
}
export interface Branch {
  details?: CaseDetails;
  id: string;
  caseId: string;
  name: string;
  revision: number;
  parentId: string | null;
  closingDate: string;
  purchasePrice: number;
  loanAmount: number;
  assumptions: string[];
  documentIds: string[];
  createdAt: string;
}
export interface Exchange {
  id: string;
  reviewer: Role;
  target?: Role;
  findingId?: string;
  kind:
    | 'review'
    | 'challenge'
    | 'response'
    | 'human-response'
    | 'lead'
    | 'coverage-check'
    | 'coverage-recheck';
  text: string;
  citations: Citation[];
  disposition?: 'retain' | 'narrow' | 'withdraw';
  unresolved?: boolean;
}
export interface CoverageRecord {
  outcomeVersion?: 'scenario-1';
  scenario?: {
    status: 'issue' | 'insufficient' | 'no_issue' | 'not_applicable';
    explanation: string;
    citations: Citation[];
    findingIds: string[];
    limitationIds: string[];
  };
  auditAddressed?: boolean;
  topicId: string;
  reviewer: Role;
  status: 'issue' | 'no_issue' | 'insufficient' | 'not_applicable' | 'unassessed';
  explanation: string;
  citations: Citation[];
  findingIds: string[];
  gaps: string[];
  auditQuestion?: string;
  auditResponse?: string;
  auditResolved?: boolean;
}
export interface Review {
  coverageVersion?: string;
  coverage?: CoverageRecord[];
  coverageStatus?: 'pending' | 'complete' | 'incomplete';
  coverageAuditDone?: boolean;
  coverageRechecked?: Role[];
  coverageHistory?: {
    reviewer: Role;
    findings: Finding[];
    coverage: CoverageRecord[];
    at: string;
  }[];
  id: string;
  caseId: string;
  branchId: string;
  revision: number;
  snapshot: Snapshot;
  mode: 'single' | 'independent' | 'cross' | 'specialist';
  selectedReviewer?: (typeof roles)[number];
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  stage: number;
  stageName: string;
  pauseRequested: boolean;
  findings: Finding[];
  exchanges: Exchange[];
  brief: string;
  needsRerun: boolean;
  // Peer consultation may leave human follow-up without invalidating the team run.
  crossSpecialtyFollowup?: boolean;
  statusPolicyVersion?: 2;
  error?: string;
  createdAt: string;
  completedAt?: string;
  durationMs?: number;
  usage: unknown[];
  activities?: {
    id: string;
    reviewer: Role;
    stage: number;
    label: string;
    state: 'running' | 'completed' | 'failed' | 'interrupted';
    startedAt: string;
    attempt?: number;
    completedAt?: string;
  }[];
}
export interface Intervention {
  id: string;
  caseId: string;
  branchId: string;
  revision: number;
  reviewId: string;
  findingId: string;
  kind: 'question' | 'challenge' | 'evidence' | 'hypothetical';
  text: string;
  citation?: Citation;
  state: 'queued' | 'processing' | 'completed' | 'failed';
  response?: string;
  disposition?: 'retain' | 'narrow' | 'withdraw';
  error?: string;
  createdAt: string;
}
export interface CaseRecord {
  displayAddress?: string;
  template?: 'demo' | 'blank';
  status?: 'open' | 'finalized';
  version?: number;
  finalizedAt?: string;
  finalizationNote?: string;
  lifecycle?: { action: 'finalized' | 'reopened'; at: string; note: string }[];
  id: string;
  sessionId: string;
  name: string;
  address: string;
  branchIds: string[];
  createdAt: string;
}
export interface Note {
  id: string;
  branchId: string;
  text: string;
  createdAt: string;
}
export interface ProgressEvent {
  id: number;
  sessionId: string;
  caseId: string;
  branchId: string;
  revision: number;
  reviewId?: string;
  reviewer?: Role;
  findingId?: string;
  documentId?: string;
  type: string;
  data: unknown;
  createdAt: string;
}
export interface Workspace {
  case: CaseRecord;
  branch: Branch;
  snapshot: Snapshot;
  branches: Branch[];
  reviews: Review[];
  interventions: Intervention[];
  notes: Note[];
  reveals: { id: string; title: string }[];
  lastEventId: number;
}
