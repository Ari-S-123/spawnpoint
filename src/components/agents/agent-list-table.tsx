'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type AgentTask = {
  platform: string;
  status: string;
};

type Agent = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  tasks: AgentTask[];
};

const PLATFORM_LABELS: Record<string, string> = {
  vercel: 'Vercel',
  sentry: 'Sentry',
  mintlify: 'Mintlify',
  instagram: 'Instagram',
  twitter: 'X'
};

function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-400';
    case 'in_progress':
    case 'awaiting_verification':
      return 'bg-amber-400';
    case 'failed':
    case 'needs_human':
      return 'bg-red-400';
    default:
      return 'bg-zinc-600';
  }
}

export function AgentListTable({ agents }: { agents: Agent[] }) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 p-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/15 bg-amber-500/10 text-amber-400">
          <Bot className="h-7 w-7" />
        </div>
        <p className="text-lg font-medium">No agents yet</p>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Create your first agent to automatically provision accounts across all platforms.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => {
        const completed = agent.tasks.filter((t) => t.status === 'completed').length;
        const total = agent.tasks.length || 5;
        const allDone = completed === total && total > 0;

        return (
          <Link
            key={agent.id}
            href={`/dashboard/agents/${agent.id}`}
            className="group relative flex flex-col rounded-xl border border-border/50 bg-card p-5 transition-all hover:border-amber-500/30 hover:bg-card/80"
          >
            {allDone && (
              <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-gradient-to-r from-emerald-500/60 via-emerald-400/80 to-emerald-500/60" />
            )}

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold tracking-tight">{agent.name}</p>
                  <p className="mt-0.5 max-w-[180px] truncate font-mono text-xs text-muted-foreground">{agent.email}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-amber-400" />
            </div>

            {/* Platform status dots */}
            <div className="mt-4 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {agent.tasks.map((task) => (
                  <div
                    key={task.platform}
                    className={`h-2.5 w-2.5 rounded-full ${getStatusColor(task.status)}`}
                    title={`${PLATFORM_LABELS[task.platform] ?? task.platform}: ${task.status}`}
                  />
                ))}
                {Array.from({ length: Math.max(0, 5 - agent.tasks.length) }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {completed}/{total}
              </span>
            </div>

            {/* Footer */}
            <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-3">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(agent.createdAt), { addSuffix: true })}
              </span>
              {allDone ? (
                <Badge variant="outline" className="border-emerald-500/30 px-2 py-0 text-[10px] text-emerald-400">
                  Ready
                </Badge>
              ) : completed > 0 ? (
                <Badge variant="outline" className="border-amber-500/30 px-2 py-0 text-[10px] text-amber-400">
                  In Progress
                </Badge>
              ) : (
                <Badge variant="outline" className="px-2 py-0 text-[10px]">
                  Pending
                </Badge>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
