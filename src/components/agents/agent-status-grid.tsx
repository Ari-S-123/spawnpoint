'use client';

import { useTaskStream } from '@/hooks/use-task-stream';
import { PlatformStatusCard } from '@/components/agents/platform-status-card';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff } from 'lucide-react';
import type { Platform } from '@/types';

type Task = {
  id: string;
  platform: string;
  status: string;
  browserSessionId: string | null;
  errorMessage: string | null;
};

export function AgentStatusGrid({ agentId, initialTasks }: { agentId: string; initialTasks: Task[] }) {
  const { events, isConnected } = useTaskStream(agentId);

  // Merge SSE events with initial task data to get latest status per platform
  const tasksByPlatform = new Map<
    string,
    { status: string; message?: string; browserSessionId?: string | null; screenshot?: string | null }
  >();

  // Start with initial task data
  for (const task of initialTasks) {
    tasksByPlatform.set(task.platform, {
      status: task.status,
      message: task.errorMessage ?? undefined,
      browserSessionId: task.browserSessionId
    });
  }

  // Overlay with latest SSE events (most recent wins)
  for (const event of events) {
    const prev = tasksByPlatform.get(event.platform);
    tasksByPlatform.set(event.platform, {
      status: event.status,
      message: event.message,
      browserSessionId: event.browserSessionId ?? prev?.browserSessionId,
      screenshot: event.screenshot ?? prev?.screenshot
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Badge variant={isConnected ? 'default' : 'secondary'} className="gap-1">
          {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {isConnected ? 'Live' : 'Connecting...'}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(['vercel', 'sentry', 'mintlify', 'instagram', 'twitter'] as Platform[]).map((platform) => {
          const data = tasksByPlatform.get(platform);
          return (
            <PlatformStatusCard
              key={platform}
              platform={platform}
              status={(data?.status ?? 'pending') as 'pending'}
              message={data?.message}
              browserSessionId={data?.browserSessionId}
              screenshot={data?.screenshot}
            />
          );
        })}
      </div>
    </div>
  );
}
