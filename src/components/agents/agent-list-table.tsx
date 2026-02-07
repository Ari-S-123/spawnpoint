'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Agent = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export function AgentListTable({ agents }: { agents: Agent[] }) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/50 p-12 text-center">
        <p className="text-lg font-light text-zinc-300" style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}>
          No agents yet
        </p>
        <p className="mt-2 text-sm text-zinc-500">Create your first agent to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/50">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => (
            <TableRow key={agent.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-amber-500/20 font-mono text-xs text-amber-200/80">
                    {agent.name}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">{agent.email}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(agent.createdAt), {
                  addSuffix: true
                })}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="text-zinc-400 hover:bg-amber-500/10 hover:text-amber-300"
                >
                  <Link href={`/dashboard/agents/${agent.id}`}>
                    <ExternalLink className="mr-1 h-3 w-3" />
                    View
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
