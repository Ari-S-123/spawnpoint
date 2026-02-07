'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles } from 'lucide-react';

const MAX_AGENTS = 3;

export function CreateAgentForm({ agentCount }: { agentCount: number }) {
  const atLimit = agentCount >= MAX_AGENTS;
  const router = useRouter();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (name.length < 2) {
      setError('Agent name must be at least 2 characters.');
      return;
    }

    if (!/^[a-zA-Z0-9-]+$/.test(name)) {
      setError('Only alphanumeric characters and hyphens allowed.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create agent');
      }

      const data = await res.json();
      toast.success(`Agent "${name}" created successfully!`);
      router.push(`/dashboard/agents/${data.agent.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Create New Agent
          </CardTitle>
          <Badge variant={atLimit ? 'destructive' : 'secondary'} className="text-xs">
            {agentCount}/{MAX_AGENTS} agents
          </Badge>
        </div>
        <CardDescription>
          {atLimit
            ? 'Agent limit reached. Delete an existing agent to create a new one.'
            : 'Enter a name for your AI agent. SpawnPoint will automatically create accounts across all six platforms.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1">
            <Input
              placeholder="e.g. cool-agent-007"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading || atLimit}
              className="h-10"
            />
            {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
          </div>
          <Button type="submit" disabled={isLoading || atLimit || name.length < 2}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Spawn Agent'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
