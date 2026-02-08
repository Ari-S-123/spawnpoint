'use client';

import { useMemo, useEffect, useState, useCallback } from 'react';
import { useTaskStreamContext } from '@/components/agents/task-stream-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Monitor, MonitorOff, Maximize2, Minimize2 } from 'lucide-react';
import type { Platform } from '@/types';

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'border-pink-500/30 text-pink-300',
  tiktok: 'border-cyan-400/30 text-cyan-300',
  twitter: 'border-zinc-400/30 text-zinc-300',
  mintlify: 'border-green-400/30 text-green-300',
  vercel: 'border-zinc-300/30 text-zinc-300',
  sentry: 'border-purple-400/30 text-purple-300'
};

const PLATFORM_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'X / Twitter',
  mintlify: 'Mintlify',
  vercel: 'Vercel',
  sentry: 'Sentry'
};

type LiveSession = {
  platform: Platform;
  liveViewUrl: string;
  status: string;
  message?: string;
};

export function LiveViewPanel() {
  const { events } = useTaskStreamContext();
  const [iframeDisconnected, setIframeDisconnected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  // Derive active live sessions from SSE events
  // Terminal status (completed/failed) is derived directly from events — no effect needed
  const activeSessions = useMemo(() => {
    const map = new Map<string, LiveSession>();
    const terminalPlatforms = new Set<string>();

    for (const event of events) {
      const existing = map.get(event.platform);

      if (event.status === 'completed' || event.status === 'failed') {
        terminalPlatforms.add(event.platform);
      }

      if (event.liveViewUrl) {
        map.set(event.platform, {
          platform: event.platform,
          liveViewUrl: event.liveViewUrl,
          status: event.status,
          message: event.message
        });
      } else if (existing) {
        map.set(event.platform, {
          ...existing,
          status: event.status,
          message: event.message
        });
      }
    }

    return Array.from(map.values()).filter(
      (s) => !terminalPlatforms.has(s.platform) && !iframeDisconnected.has(s.platform)
    );
  }, [events, iframeDisconnected]);

  // Listen for Browserbase disconnect messages from iframes
  // Only updates state from the event handler callback (not from an effect body)
  const handleMessage = useCallback(
    (e: MessageEvent) => {
      if (e.data === 'browserbase-disconnected') {
        setIframeDisconnected((prev) => {
          const next = new Set(prev);
          for (const s of activeSessions) {
            next.add(s.platform);
          }
          return next;
        });
      }
    },
    [activeSessions]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  if (activeSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/50 p-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800/30 bg-zinc-900/50">
          <MonitorOff className="h-6 w-6 text-zinc-600" />
        </div>
        <p className="text-sm text-zinc-300">No active browser sessions</p>
        <p className="mt-1 max-w-xs text-xs text-zinc-500">
          Live browser views will appear here when signup tasks are running.
        </p>
      </div>
    );
  }

  const gridClass = expanded
    ? 'grid-cols-1'
    : activeSessions.length === 1
      ? 'grid-cols-1'
      : 'grid-cols-1 lg:grid-cols-2';

  const sessionsToShow = expanded ? activeSessions.filter((s) => s.platform === expanded) : activeSessions;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium">
            {activeSessions.length} active session{activeSessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        {expanded && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-zinc-400 hover:text-amber-300"
            onClick={() => setExpanded(null)}
          >
            <Minimize2 className="h-3 w-3" />
            Show all
          </Button>
        )}
      </div>

      {/* Session grid */}
      <div className={cn('grid gap-4', gridClass)}>
        {sessionsToShow.map((session) => (
          <div key={session.platform} className="overflow-hidden rounded-xl border border-zinc-800/50 bg-zinc-950">
            {/* Session header */}
            <div className="flex items-center justify-between border-b border-zinc-800/30 px-4 py-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn('capitalize', PLATFORM_COLORS[session.platform])}>
                  {PLATFORM_NAMES[session.platform] ?? session.platform}
                </Badge>
                <span className="max-w-xs truncate text-xs text-zinc-500">{session.message}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="relative mr-1 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                </span>
                <span className="text-[10px] text-amber-300">LIVE</span>
                {!expanded && activeSessions.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-1 h-6 w-6 text-zinc-500 hover:text-amber-300"
                    onClick={() => setExpanded(session.platform)}
                  >
                    <Maximize2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {/* Interactive iframe */}
            <div className={cn('relative w-full', expanded ? 'h-[70vh]' : 'h-[400px]')}>
              <iframe
                src={session.liveViewUrl}
                className="h-full w-full border-0"
                sandbox="allow-same-origin allow-scripts"
                allow="clipboard-read; clipboard-write"
                title={`Live view: ${session.platform}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
