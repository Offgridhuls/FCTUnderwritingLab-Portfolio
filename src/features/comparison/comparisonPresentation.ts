import type { ComparisonOutcome, TopicComparison } from '../../../shared/comparison';
import { isActionableFinding, type Review } from '../../../shared/types';

export const outcomeOrder: ComparisonOutcome[] = [
  'addressed',
  'new',
  'action',
  'uncertain',
  'unchanged',
];
export const outcomeLabels: Record<ComparisonOutcome, string> = {
  addressed: 'Addressed',
  new: 'New issues',
  action: 'Still needs action',
  uncertain: 'Cannot compare reliably',
  unchanged: 'Unchanged',
};
export const shortStatus: Record<string, string> = {
  issue: 'Issue found',
  insufficient: 'Evidence missing',
  no_issue: 'No issue identified',
  not_applicable: 'Not applicable',
  unassessed: 'Not assessed',
};
export const detailLabels: Record<string, string> = {
  seller: 'Seller',
  buyer: 'Buyer',
  address: 'Property address',
  parcel: 'Parcel identifier',
  closingDate: 'Closing date',
  purchasePrice: 'Purchase price',
  loanAmount: 'Loan amount',
};
export const readableField = (field: string) =>
  detailLabels[field] || field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\.]/g, ' ');
export function hasOpenWork(topic: TopicComparison) {
  return [...topic.after.findings, ...topic.after.limitations].some(isActionableFinding);
}
export function visibleTopic(
  topic: TopicComparison,
  all: boolean,
  reviewer: string,
  outcome: string,
) {
  return (
    (all || topic.changed || topic.outcome === 'uncertain' || hasOpenWork(topic)) &&
    (!reviewer || topic.reviewer === reviewer) &&
    (!outcome || topic.outcome === outcome)
  );
}
export function reviewScope(review: Review) {
  return review.mode === 'specialist'
    ? 'Partial scope'
    : review.mode === 'single'
      ? 'Single reviewer'
      : review.mode === 'independent'
        ? 'Independent team'
        : 'Full team with cross-review';
}
