'use client';

import { useMemo } from 'react';
import { useTaskStream } from '@/hooks/use-task-stream';
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

const PLATFORMS: { key: Platform; name: string }[] = [
  { key: 'vercel', name: 'Vercel' },
  { key: 'sentry', name: 'Sentry' },
  { key: 'mintlify', name: 'Mintlify' },
  { key: 'instagram', name: 'Instagram' },
  { key: 'twitter', name: 'X / Twitter' }
];

export function AgentStatusGrid({ agentId, initialTasks }: { agentId: string; initialTasks: Task[] }) {
  const { events, isConnected } = useTaskStream(agentId);

  const tasksByPlatform = useMemo(() => {
    const map = new Map<string, { status: string; message?: string; browserSessionId?: string | null }>();
    for (const task of initialTasks) {
      map.set(task.platform, {
        status: task.status,
        message: task.errorMessage ?? undefined,
        browserSessionId: task.browserSessionId
      });
    }
    for (const event of events) {
      map.set(event.platform, {
        status: event.status,
        message: event.message,
        browserSessionId: event.browserSessionId ?? map.get(event.platform)?.browserSessionId
      });
    }
    return map;
  }, [initialTasks, events]);

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

      {/* Platform list */}
      <div className="divide-y divide-border/20">
        {PLATFORMS.map(({ key, name }) => {
          const data = tasksByPlatform.get(key);
          const status = data?.status ?? 'pending';
          const config = (STATUS_CONFIG[status] ?? STATUS_CONFIG['pending'])!;
          const StatusIcon = config.icon;

          return (
            <div key={key} className="flex items-center gap-2.5 px-4 py-2">
              <div className={cn('h-2 w-2 shrink-0 rounded-full', config.dotColor)} />
              <span className="min-w-0 flex-1 truncate text-xs">{name}</span>
              <div className="flex items-center gap-1.5">
                <StatusIcon className={cn('h-3 w-3 text-muted-foreground', config.spin && 'animate-spin')} />
                <span className="text-[10px] text-muted-foreground">{config.label}</span>
              </div>
              {status === 'needs_human' && data?.browserSessionId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-amber-400"
                  onClick={() => window.open(`https://www.browserbase.com/sessions/${data.browserSessionId}`, '_blank')}
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
