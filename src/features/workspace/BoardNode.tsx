import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AlertTriangle, FileText, House, Users } from 'lucide-react';
export interface BoardNodeData extends Record<string, unknown> {
  kind: string;
  kicker: string;
  label: string;
  detail: string;
  reviewer?: string;
}
export function BoardNode({ data: d }: NodeProps<Node<BoardNodeData>>) {
  return (
    <div className={`board-node ${d.kind}`}>
      <Handle type="target" position={Position.Left} />
      <span className="node-kicker">{d.kicker}</span>
      <div className="node-title">
        {d.kind === 'property' ? (
          <House size={20} />
        ) : d.kind === 'finding' ? (
          <AlertTriangle size={17} />
        ) : d.kind === 'person' ? (
          <Users size={17} />
        ) : (
          <FileText size={17} />
        )}
        <strong>{d.label}</strong>
      </div>
      <small>{d.detail}</small>
      <Handle type="source" position={Position.Right} />
      {d.kind === 'property' && <Handle id="reviews" type="source" position={Position.Bottom} />}
    </div>
  );
}
