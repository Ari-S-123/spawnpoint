'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';

type Message = {
  message_id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

export function InboxViewer({ inboxId }: { inboxId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/${inboxId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [inboxId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/50 p-12 text-center">
        <Mail className="mb-3 h-8 w-8 text-amber-400/60" />
        <p className="text-sm text-zinc-300" style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}>
          No messages yet
        </p>
        <p className="mt-1 text-xs text-zinc-500">Verification emails will appear here.</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 border-zinc-700/50 hover:border-amber-500/30 hover:text-amber-200"
          onClick={fetchMessages}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Badge variant="secondary" className="border border-zinc-700/50 text-zinc-300">
          {messages.length} messages
        </Badge>
        <Button
          variant="outline"
          size="sm"
          className="border-zinc-700/50 hover:border-amber-500/30 hover:text-amber-200"
          onClick={fetchMessages}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Refresh
        </Button>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {messages.map((msg) => (
            <Card
              key={msg.message_id}
              className="cursor-pointer border-zinc-800/50 transition-all duration-300 hover:border-zinc-700/50 hover:bg-amber-500/5"
              onClick={() => setExpandedId(expandedId === msg.message_id ? null : msg.message_id)}
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm font-medium">{msg.subject}</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">From: {msg.from}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {msg.date && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(msg.date), {
                          addSuffix: true
                        })}
                      </span>
                    )}
                    {expandedId === msg.message_id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>
              </CardHeader>
              {expandedId === msg.message_id && (
                <CardContent className="px-4 pt-0 pb-4">
                  <p className="text-sm text-muted-foreground">{msg.snippet}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
