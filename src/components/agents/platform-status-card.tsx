'use client';

import { useState } from 'react';
import { ExternalLink, Camera, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Platform } from '@/types';

const STATUS_CONFIG = {
  pending: { label: 'Pending', variant: 'secondary' as const, pulse: false },
  in_progress: { label: 'In Progress', variant: 'default' as const, pulse: true },
  awaiting_verification: { label: 'Verifying', variant: 'outline' as const, pulse: true },
  needs_human: { label: 'Needs Human', variant: 'destructive' as const, pulse: true },
  completed: { label: 'Completed', variant: 'default' as const, pulse: false },
  failed: { label: 'Failed', variant: 'destructive' as const, pulse: false }
} as const;

const PLATFORM_DISPLAY: Record<Platform, { name: string; color: string }> = {
  instagram: { name: 'Instagram', color: 'from-pink-500 to-purple-500' },
  twitter: { name: 'X / Twitter', color: 'from-zinc-600 to-zinc-400' },
  mintlify: { name: 'Mintlify', color: 'from-green-400 to-emerald-600' },
  vercel: { name: 'Vercel', color: 'from-zinc-200 to-zinc-500' },
  sentry: { name: 'Sentry', color: 'from-purple-500 to-violet-600' }
};

const ACTIVE_STATUSES = new Set(['in_progress', 'awaiting_verification', 'needs_human']);

type Props = {
  platform: Platform;
  status: keyof typeof STATUS_CONFIG;
  message?: string;
  browserSessionId?: string | null;
  screenshot?: string | null;
};

export function PlatformStatusCard({ platform, status, message, browserSessionId, screenshot }: Props) {
  const display = PLATFORM_DISPLAY[platform];
  const statusConfig = STATUS_CONFIG[status];
  const [showScreenshot, setShowScreenshot] = useState(false);

  const showBrowserLink = browserSessionId && (ACTIVE_STATUSES.has(status) || status === 'failed');

  return (
    <Card className={cn('relative overflow-hidden', status === 'completed' && 'border-green-500/30')}>
      <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', display.color)} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{display.name}</CardTitle>
          <Badge variant={statusConfig.variant} className={cn(statusConfig.pulse && 'animate-pulse')}>
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {message && <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{message}</p>}

        <div className="flex flex-col gap-2">
          {showBrowserLink && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => window.open(`https://www.browserbase.com/sessions/${browserSessionId}`, '_blank')}
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              View Browser
            </Button>
          )}

          {screenshot && (
            <>
              <button
                onClick={() => setShowScreenshot(!showScreenshot)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {showScreenshot ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Camera className="h-3 w-3" />
                Screenshot
              </button>
              {showScreenshot && (
                <img
                  src={`data:image/png;base64,${screenshot}`}
                  alt={`${display.name} page screenshot`}
                  className="w-full rounded border"
                />
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
