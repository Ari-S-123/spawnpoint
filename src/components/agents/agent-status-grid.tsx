'use client';

import { useTaskStreamContext } from '@/components/agents/task-stream-provider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff } from 'lucide-react';
import { PlatformStatusCard } from '@/components/agents/platform-status-card';
import type { Platform } from '@/types';

type Task = {
  id: string;
  platform: string;
  status: string;
  browserSessionId: string | null;
  errorMessage: string | null;
};

// Merge SSE events with initial task data to get latest status per platform
const tasksByPlatform = new Map<
  string,
  { status: string; message?: string; browserSessionId?: string | null; screenshot?: string | null }
>();

export function AgentStatusGrid({ initialTasks }: { initialTasks: Task[] }) {
  const { events, isConnected } = useTaskStreamContext();

  // Seed from initial tasks
  for (const task of initialTasks) {
    if (!tasksByPlatform.has(task.platform)) {
      tasksByPlatform.set(task.platform, {
        status: task.status,
        browserSessionId: task.browserSessionId
      });
    }
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
    <div className="rounded-xl border border-zinc-800/50 bg-card/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/30 px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">Connections</span>
        <Badge
          variant={isConnected ? 'default' : 'secondary'}
          className={cn(
            'h-5 gap-1 px-1.5 text-[10px]',
            isConnected && 'border border-amber-500/25 bg-amber-500/15 text-amber-300'
          )}
        >
          {isConnected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
          {isConnected ? 'Live' : '...'}
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
