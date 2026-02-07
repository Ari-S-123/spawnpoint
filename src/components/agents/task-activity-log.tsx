'use client';

import { useTaskStream } from '@/hooks/use-task-stream';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'border-pink-500/30 text-pink-300',
  tiktok: 'border-cyan-400/30 text-cyan-300',
  twitter: 'border-zinc-400/30 text-zinc-300',
  mintlify: 'border-green-400/30 text-green-300',
  vercel: 'border-zinc-300/30 text-zinc-300',
  sentry: 'border-purple-400/30 text-purple-300'
};

export function TaskActivityLog({ agentId }: { agentId: string }) {
  const { events } = useTaskStream(agentId);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/50 p-12 text-center">
        <p className="text-sm text-zinc-500">No activity yet. Events will appear here as the signup process runs.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-3">
        {events.map((event, i) => (
          <div
            key={`${event.taskId}-${i}`}
            className="flex items-start gap-3 rounded-xl border border-zinc-800/50 p-3 transition-colors duration-300 hover:border-zinc-700/60 hover:bg-zinc-900/30"
          >
            <Badge variant="outline" className={cn('mt-0.5 shrink-0 capitalize', PLATFORM_COLORS[event.platform])}>
              {event.platform}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{event.message}</p>
              <p className="mt-1 text-xs text-zinc-500">{new Date(event.timestamp).toLocaleTimeString()}</p>
            </div>
            <Badge
              variant={
                event.status === 'completed' ? 'default' : event.status === 'failed' ? 'destructive' : 'secondary'
              }
              className={cn(
                'shrink-0',
                event.status === 'completed' && 'border-amber-500/25 bg-amber-500/15 text-amber-300'
              )}
            >
              {event.status.replace('_', ' ')}
            </Badge>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
