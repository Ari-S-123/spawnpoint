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
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-lg font-medium text-muted-foreground">No agents yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Create your first agent to get started.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
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
                  <Badge variant="outline" className="font-mono text-xs">
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
                <Button variant="ghost" size="sm" asChild>
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
