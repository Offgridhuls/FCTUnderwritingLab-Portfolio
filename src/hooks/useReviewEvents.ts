import { useEffect, useRef, useState } from 'react';
import type { Role, Workspace } from '../../shared/types';
import { api } from '../api';

interface ProgressEvent {
  id: number;
  branchId: string;
  type: string;
  reviewer?: Role;
}

function parseEvent(value: unknown): ProgressEvent | undefined {
  if (!value || typeof value !== 'object') return;
  const event = value as Record<string, unknown>;
  if (
    typeof event.id !== 'number' ||
    typeof event.branchId !== 'string' ||
    typeof event.type !== 'string'
  )
    return;
  return event as unknown as ProgressEvent;
}

export function useReviewEvents(
  signedIn: boolean,
  branchId: string,
  refresh: () => Promise<Workspace | undefined>,
) {
  const cursor = useRef(0);
  const [live, setLive] = useState('Connecting');
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  useEffect(() => {
    if (!signedIn || !branchId) return;
    let closed = false;
    let source: EventSource | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    const update = () => {
      if (closed || refreshing) return;
      refreshing = true;
      void refresh()
        .catch(() => {})
        .finally(() => {
          refreshing = false;
        });
    };
    const accept = (event: ProgressEvent) => {
      if (closed) return;
      cursor.current = Math.max(cursor.current, event.id);
      if (event.branchId !== branchId) return;
      if (event.type === 'reviewer.started') setActiveRole(event.reviewer || null);
      if (
        ['review.completed', 'review.failed', 'review.paused', 'review.cancelled'].includes(
          event.type,
        )
      )
        setActiveRole(null);
      update();
    };
    const open = async () => {
      try {
        const current = await refresh();
        if (closed) return;
        if (!cursor.current) cursor.current = current?.lastEventId || 0;
        source = new EventSource(`/api/v1/events/stream?after=${cursor.current}`);
        source.onopen = () => {
          if (!closed) setLive('Live');
        };
        source.onmessage = (message) => {
          try {
            const event = parseEvent(JSON.parse(message.data));
            if (event) accept(event);
          } catch {
            /* Polling repairs an invalid or interrupted event frame. */
          }
        };
        source.onerror = () => {
          source?.close();
          if (closed) return;
          setLive('Reconnecting');
          reconnect = setTimeout(() => void open(), 2500);
        };
      } catch {
        if (!closed) reconnect = setTimeout(() => void open(), 2500);
      }
    };
    void open();
    const poll = setInterval(() => {
      void api<{ events: unknown[] }>(`/events?after=${cursor.current}`)
        .then((data) => {
          for (const value of data.events) {
            const event = parseEvent(value);
            if (event) accept(event);
          }
        })
        .catch(() => {
          if (!closed) setLive('Offline');
        });
    }, 5000);
    return () => {
      closed = true;
      source?.close();
      clearTimeout(reconnect);
      clearInterval(poll);
    };
  }, [signedIn, branchId, refresh]);
  return { cursor, live, activeRole };
}
