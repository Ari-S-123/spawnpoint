'use client';

import { createContext, useContext } from 'react';
import { useTaskStream } from '@/hooks/use-task-stream';
import type { TaskStatusEvent } from '@/types';

type TaskStreamContextValue = {
  events: TaskStatusEvent[];
  isConnected: boolean;
};

const TaskStreamContext = createContext<TaskStreamContextValue>({
  events: [],
  isConnected: false
});

export function TaskStreamProvider({ agentId, children }: { agentId: string; children: React.ReactNode }) {
  const value = useTaskStream(agentId);
  return <TaskStreamContext.Provider value={value}>{children}</TaskStreamContext.Provider>;
}

export function useTaskStreamContext() {
  return useContext(TaskStreamContext);
}
