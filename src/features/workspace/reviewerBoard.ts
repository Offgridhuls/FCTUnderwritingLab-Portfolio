import type { Edge, Node } from '@xyflow/react';
import {
  isActionableFinding,
  roleNames,
  type CaseDetails,
  type CaseRecord,
  type Review,
  type Role,
} from '../../../shared/types';
import type { BoardNodeData } from './BoardNode';

// A separate vertical band for each reviewer keeps sibling branches from crossing.
export function reviewerBoard(
  review: Review | undefined,
  reviewers: Role[],
  running: boolean,
  caseRecord?: CaseRecord,
  details?: CaseDetails,
) {
  const nodes: Node<BoardNodeData>[] = [];
  const edges: Edge[] = [];
  let top = caseRecord?.template === 'blank' ? 0 : 620;
  for (const role of reviewers) {
    const findings = (review?.findings || []).filter(
      (f) => f.reviewer === role && isActionableFinding(f),
    );
    if (role === 'lead' && !findings.length) continue;
    const height = Math.max(1, findings.length) * 178;
    const id = `reviewer-${role}`;
    const assessed = review?.exchanges.some((e) => e.reviewer === role && e.kind === 'review');
    nodes.push({
      id,
      type: 'case',
      position: { x: 370, y: top + (height - 138) / 2 },
      data: {
        kind: 'reviewer-branch',
        reviewer: role,
        kicker: 'RESPONSIBLE REVIEWER',
        label: roleNames[role],
        detail: findings.length
          ? `${findings.length} actionable · click to focus`
          : assessed
            ? 'No actionable findings reported'
            : 'Not assessed yet',
      },
    });
    edges.push({
      id: `case-${role}`,
      source: 'property',
      sourceHandle: 'reviews',
      target: id,
      type: 'smoothstep',
    });
    findings.forEach((f, index) => {
      nodes.push({
        id: f.id,
        type: 'case',
        position: { x: 760, y: top + index * 178 },
        data: {
          kind: 'finding',
          kicker: roleNames[role],
          label: f.title,
          detail:
            f.category === 'assessment_limit'
              ? 'Action required · assessment limitation'
              : 'Action required · click to inspect',
        },
      });
      edges.push({
        id: `finding-${f.id}`,
        source: id,
        target: f.id,
        type: 'smoothstep',
        animated: running,
      });
    });
    top += height + 60;
  }
  nodes.unshift({
    id: 'property',
    type: 'case',
    position: { x: 0, y: 190 },
    data: {
      kind: 'property',
      kicker: 'SUBJECT PROPERTY',
      label: caseRecord?.address || '18 Alder Lane',
      detail: 'Ontario purchase · reviewer branches',
    },
  });
  if (caseRecord?.template !== 'blank')
    nodes.push(
      {
        id: 'seller',
        type: 'case',
        position: { x: -370, y: 55 },
        data: {
          kind: 'person',
          kicker: 'SELLER + REPRESENTATIVE',
          label: 'Morgan Ellis / Jordan Vale',
          detail: 'Authority documentation to review',
        },
      },
      {
        id: 'buyer',
        type: 'case',
        position: { x: -370, y: 325 },
        data: {
          kind: 'person',
          kicker: 'PURCHASER',
          label: 'Alex Chen',
          detail: 'Residential freehold purchase',
        },
      },
      {
        id: 'mortgage',
        type: 'case',
        position: { x: 370, y: 55 },
        data: {
          kind: 'document',
          kicker: 'EXISTING CHARGE',
          label: 'Cedar Bank',
          detail: 'DEMO-CH-100 � payout validity',
        },
      },
      {
        id: 'municipal',
        type: 'case',
        position: { x: 370, y: 325 },
        data: {
          kind: 'document',
          kicker: 'MUNICIPAL RECORD',
          label: 'Rear deck notice',
          detail: 'DEMO-M-22 � clarification requested',
        },
      },
    );
  if (caseRecord?.template !== 'blank')
    edges.push(
      {
        id: 'sp',
        source: 'seller',
        target: 'property',
        label: 'sale authority',
        type: 'smoothstep',
      },
      { id: 'bp', source: 'buyer', target: 'property', label: 'purchases', type: 'smoothstep' },
      { id: 'pm', source: 'property', target: 'mortgage', label: 'secured by', type: 'smoothstep' },
      { id: 'pn', source: 'property', target: 'municipal', label: 'records', type: 'smoothstep' },
    );
  if (caseRecord?.template === 'blank' && details?.confirmed) {
    for (const [index, field] of (['seller', 'buyer'] as const).entries()) {
      if (!details.values[field]) continue;
      nodes.push({
        id: field,
        type: 'case',
        position: { x: -370, y: 55 + index * 270 },
        data: {
          kind: 'person',
          kicker: field.toUpperCase(),
          label: details.values[field],
          detail:
            details.origins[field] === 'user'
              ? 'User correction · unverified'
              : 'Document-derived · user confirmed',
        },
      });
      edges.push({
        id: `person-${field}`,
        source: field,
        target: 'property',
        type: 'smoothstep',
        label: field,
      });
    }
    const property = nodes.find((n) => n.id === 'property')!;
    property.data.detail = details.values.parcel
      ? `Parcel: ${details.values.parcel} · working details`
      : 'Parcel not confirmed';
  }
  return { nodes, edges };
}
