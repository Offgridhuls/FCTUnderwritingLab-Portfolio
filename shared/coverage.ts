import type { Role } from './types';
export const COVERAGE_VERSION = 'demo-coverage-1';
export const coverageTopics: { id: string; reviewer: Exclude<Role, 'lead'>; label: string }[] = [
  ['authority', 'ownership', 'Representative authority and execution'],
  ['proceeds_authority', 'ownership', 'Authority to direct proceeds'],
  ['conveyed_land', 'ownership', 'Conveyed land versus purchase description'],
  ['access_rights', 'ownership', 'Easements and intended access'],
  ['title_currency', 'ownership', 'Current and complete title records'],
  ['name_variation', 'identity', 'Name discrepancies and supplied explanations'],
  ['identity_evidence', 'identity', 'Scope of identity-verification evidence'],
  ['payout_conditions', 'mortgage', 'Payout dates, amounts and conditions'],
  ['parcel_release', 'mortgage', 'Cross-security and parcel release'],
  ['charge_matching', 'mortgage', 'Creditor, charge, parcel and discharge matching'],
  ['lien_settlement', 'mortgage', 'Lien and settlement scope'],
  ['lender_occupancy', 'mortgage', 'Lender conditions versus tenancy and intended occupancy'],
  [
    'funds_reconciliation',
    'mortgage',
    'Authorized financing, deposit treatment and funds reconciliation',
  ],
  ['notice_status', 'property', 'Municipal notice status and timing'],
  ['permit_scope', 'property', 'Permit scope versus work and intended use'],
  ['survey_scope', 'survey', 'Currency and scope of survey evidence'],
  ['physical_boundaries', 'survey', 'Current improvements, boundaries and occupation'],
  ['suspicious_instructions', 'fraud', 'Documented suspicious communications and payment changes'],
  ['independent_channels', 'fraud', 'Independent verification through established channels'],
].map(([id, reviewer, label]) => ({ id, reviewer: reviewer as Exclude<Role, 'lead'>, label }));
export const coverageLabels = {
  issue: 'Issue found',
  no_issue: 'No issue identified in supplied evidence',
  insufficient: 'Insufficient evidence',
  not_applicable: 'Not applicable',
  unassessed: 'Not assessed',
};
