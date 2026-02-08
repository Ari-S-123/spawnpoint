'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Trash2, Loader2, Bot } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

type Agent = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export function AgentListTable({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/agents/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete agent');
      }
      setDeleteTarget(null);
      router.refresh();
    } catch (error) {
      console.error('Failed to delete agent:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete agent');
    } finally {
      setIsDeleting(false);
    }
  };

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800/50 p-16 text-center">
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
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[150px]">Actions</TableHead>
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
                  <div className="flex items-center gap-1">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(agent)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              This will permanently delete agent &quot;{deleteTarget?.name}&quot; and its AgentMail inbox. All
              associated credentials and setup tasks will also be removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Agent'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
