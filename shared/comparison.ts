import type { Branch, Review, Finding, Citation, Role } from './types';
export type ComparisonOutcome = 'addressed' | 'action' | 'new' | 'unchanged' | 'uncertain';
export const comparisonLabels: Record<ComparisonOutcome, string> = {
  addressed: 'Addressed in supplied evidence',
  action: 'Still needs action',
  new: 'Newly identified issue',
  unchanged: 'No substantive status change',
  uncertain: 'Not comparable / assessment incomplete',
};
export interface TopicSide {
  status: string;
  explanation: string;
  citations: Citation[];
  findings: Finding[];
  limitations: Finding[];
  reasons: string[];
}
export interface TopicComparison {
  id: string;
  label: string;
  reviewer: Role;
  outcome: ComparisonOutcome;
  changed: boolean;
  before: TopicSide;
  after: TopicSide;
}
export interface ComparisonResult {
  left?: Review;
  right?: Review;
  incomplete: boolean;
  beforeBranch: Branch;
  afterBranch: Branch;
  beforeReviews: Review[];
  afterReviews: Review[];
  reasons: string[];
  topics: TopicComparison[];
  unmapped: { before: Finding[]; after: Finding[] };
  evidence: {
    added: { id: string; title: string }[];
    removed: { id: string; title: string }[];
    newlyCited: { id: string; title: string }[];
  };
  details: { field: string; before: unknown; after: unknown }[];
  assumptions: { before: string[]; after: string[] };
  changes: { issueCode: string; state: string; before?: Finding; after?: Finding }[];
}
