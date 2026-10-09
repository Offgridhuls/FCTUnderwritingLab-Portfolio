import { useCallback, useRef, useState } from 'react';
import type { Workspace } from '../../shared/types';
import { api } from '../api';

export function useWorkspace(branchId: string) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const branchRef = useRef(branchId);
  const nextRequest = useRef(0);
  const acceptedRequest = useRef(0);
  branchRef.current = branchId;
  const refresh = useCallback(async (id = branchRef.current) => {
    if (!id) return;
    const request = ++nextRequest.current;
    const data = await api<Workspace>(`/branches/${id}/snapshot`);
    // Polls and command refreshes can finish out of order; do not roll back an accepted newer load.
    if (id === branchRef.current && request >= acceptedRequest.current) {
      acceptedRequest.current = request;
      setWorkspace(data);
    }
    return data;
  }, []);
  return { workspace, setWorkspace, refresh, branchRef };
}
