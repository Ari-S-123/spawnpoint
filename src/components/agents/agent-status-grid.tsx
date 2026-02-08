'use client';

import { useMemo } from 'react';
import { useTaskStreamContext } from '@/components/agents/task-stream-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, Check, Loader2, Clock, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';
import type { Platform } from '@/types';

type Task = {
  id: string;
  platform: string;
  status: string;
  browserSessionId: string | null;
  errorMessage: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; dotColor: string; icon: React.ElementType; spin?: boolean }> = {
  pending: { label: 'Pending', dotColor: 'bg-zinc-600', icon: Clock },
  in_progress: { label: 'Running', dotColor: 'bg-amber-400', icon: Loader2, spin: true },
  awaiting_verification: { label: 'Verifying', dotColor: 'bg-amber-400', icon: Loader2, spin: true },
  needs_human: { label: 'Action', dotColor: 'bg-red-400', icon: AlertTriangle },
  completed: { label: 'Done', dotColor: 'bg-emerald-400', icon: Check },
  failed: { label: 'Failed', dotColor: 'bg-red-400', icon: XCircle }
};

  // Merge SSE events with initial task data to get latest status per platform
  const tasksByPlatform = new Map<
    string,
    { status: string; message?: string; browserSessionId?: string | null; screenshot?: string | null }
  >();

export function AgentStatusGrid({ initialTasks }: { initialTasks: Task[] }) {
  const { events, isConnected } = useTaskStreamContext();

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
