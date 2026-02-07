'use client';

import { useTaskStream } from '@/hooks/use-task-stream';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export function TaskActivityLog({ agentId }: { agentId: string }) {
  const { events } = useTaskStream(agentId);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No activity yet. Events will appear here as the signup process runs.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-3">
        {events.map((event, i) => (
          <div key={`${event.taskId}-${i}`} className="flex items-start gap-3 rounded-lg border p-3">
            <Badge variant="outline" className="mt-0.5 shrink-0 capitalize">
              {event.platform}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{event.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</p>
            </div>
            <Badge
              variant={
                event.status === 'completed' ? 'default' : event.status === 'failed' ? 'destructive' : 'secondary'
              }
              className="shrink-0"
            >
              {event.status.replace('_', ' ')}
            </Badge>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
