'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { COMPOSIO_APPS, COMPOSIO_APP_CONFIG, type ComposioApp, type Integration } from '@/types';

type Props = {
  agentId: string;
};

export function IntegrationsPanel({ agentId }: Props) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<ComposioApp | null>(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/${agentId}`);
      if (!res.ok) return;
      const data = await res.json();
      setIntegrations(data.integrations);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Poll for pending integrations
  useEffect(() => {
    const hasPending = integrations.some((i) => i.status === 'pending');
    if (!hasPending) return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/integrations/${agentId}`);
      if (!res.ok) return;
      const data = await res.json();
      const updated = data.integrations as Integration[];
      setIntegrations(updated);

      // Toast on newly connected
      for (const u of updated) {
        const prev = integrations.find((i) => i.id === u.id);
        if (prev?.status === 'pending' && u.status === 'connected') {
          toast.success(`${COMPOSIO_APP_CONFIG[u.app].name} connected!`);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [agentId, integrations]);

  async function handleConnect(app: ComposioApp) {
    setConnecting(app);
    try {
      const res = await fetch(`/api/integrations/${agentId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app })
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to connect');
        return;
      }

      const { redirectUrl } = await res.json();

      if (redirectUrl) {
        window.open(redirectUrl, '_blank', 'width=600,height=700');
      }

      // Refresh to show pending state
      await fetchIntegrations();
    } catch {
      toast.error('Failed to initiate connection');
    } finally {
      setConnecting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Connect Existing Accounts</h3>
        <p className="text-xs text-muted-foreground">
          Link your existing accounts via OAuth so this agent can take actions on your behalf.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {COMPOSIO_APPS.map((app) => {
          const config = COMPOSIO_APP_CONFIG[app];
          const integration = integrations.find((i) => i.app === app);
          const status = integration?.status;
          const isConnecting = connecting === app;

          return (
            <Card key={app} className={cn('relative overflow-hidden', status === 'connected' && 'border-green-500/30')}>
              <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', config.color)} />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{config.name}</CardTitle>
                  {status === 'connected' && (
                    <Badge variant="outline" className="gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </Badge>
                  )}
                  {status === 'pending' && (
                    <Badge variant="secondary" className="animate-pulse gap-1 text-xs text-amber-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Pending
                    </Badge>
                  )}
                  {status === 'failed' && (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <AlertCircle className="h-3 w-3" />
                      Failed
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {status === 'connected' ? (
                  <p className="text-xs text-muted-foreground">
                    Ready to use in Actions tab.
                  </p>
                ) : status === 'pending' ? (
                  <p className="text-xs text-muted-foreground">Waiting for OAuth...</p>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={isConnecting}
                    onClick={() => handleConnect(app)}
                  >
                    {isConnecting ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <ExternalLink className="mr-1 h-3 w-3" />
                    )}
                    Connect
                  </Button>
                )}
                {status === 'failed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    disabled={isConnecting}
                    onClick={() => handleConnect(app)}
                  >
                    Retry
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
