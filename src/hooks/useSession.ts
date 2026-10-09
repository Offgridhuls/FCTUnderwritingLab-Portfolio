import { useEffect, useState } from 'react';
import type { CaseRecord } from '../../shared/types';
import { api } from '../api';

export function useSession() {
  const [signedIn, setSignedIn] = useState(false);
  const [branchId, setBranchId] = useState('');
  useEffect(() => {
    let active = true;
    void api<{ cases: CaseRecord[] }>('/sessions')
      .then((session) => {
        if (!active || !session.cases.length) return;
        setSignedIn(true);
        let remembered: string | null = null;
        try {
          remembered = sessionStorage.getItem('underwriting-branch');
        } catch {
          /* Storage can be unavailable in private browsing. */
        }
        setBranchId(
          session.cases.flatMap((item) => item.branchIds).includes(remembered || '')
            ? remembered!
            : session.cases[0].branchIds[0],
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return { signedIn, setSignedIn, branchId, setBranchId };
}
