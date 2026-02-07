'use client';

import { useEffect, useState, useRef } from 'react';
import type { TaskStatusEvent } from '@/types';

export function useTaskStream(agentId: string | undefined): {
  events: TaskStatusEvent[];
  isConnected: boolean;
} {
  const [events, setEvents] = useState<TaskStatusEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | undefined>(undefined);

  useEffect(() => {
    if (!agentId) return;

    let retryTimeout: ReturnType<typeof setTimeout>;

    function open() {
      const source = new EventSource(`/api/agents/${agentId}/stream`);
      sourceRef.current = source;

      source.onopen = () => setIsConnected(true);

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as TaskStatusEvent;
          setEvents((prev) => [...prev, data]);
        } catch {
          // Ignore malformed events (heartbeats)
        }
      };

      source.onerror = () => {
        setIsConnected(false);
        source.close();
        retryTimeout = setTimeout(open, 3000);
      };
    }

    open();

    return () => {
      clearTimeout(retryTimeout);
      sourceRef.current?.close();
    };
  }, [agentId]);

  return { events, isConnected };
}
