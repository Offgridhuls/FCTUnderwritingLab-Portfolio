import { useState } from 'react';

export function useCommand() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function act(operation: () => Promise<unknown>) {
    setError('');
    setBusy(true);
    try {
      await operation();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'The request failed.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, act };
}
