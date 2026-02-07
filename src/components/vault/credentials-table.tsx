'use client';

import { useState } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import type { Platform, PlatformCredential } from '@/types';

const PLATFORMS: Platform[] = ['vercel', 'sentry', 'mintlify', 'instagram', 'twitter'];

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'border-pink-500/30 text-pink-300',
  tiktok: 'border-cyan-400/30 text-cyan-300',
  twitter: 'border-zinc-400/30 text-zinc-300',
  mintlify: 'border-green-400/30 text-green-300',
  vercel: 'border-zinc-300/30 text-zinc-300',
  sentry: 'border-purple-400/30 text-purple-300'
};

export function CredentialsTable({ agentId }: { agentId: string }) {
  const [credentials, setCredentials] = useState<Record<string, PlatformCredential | null>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const { copy } = useCopyToClipboard();
  const [copiedField, setCopiedField] = useState('');

  async function fetchCredential(platform: Platform) {
    if (credentials[platform] !== undefined) return;

    setLoading((prev) => ({ ...prev, [platform]: true }));
    try {
      const res = await fetch(`/api/vault/${agentId}/${platform}`);
      if (res.ok) {
        const data = await res.json();
        setCredentials((prev) => ({ ...prev, [platform]: data.credential }));
      } else {
        setCredentials((prev) => ({ ...prev, [platform]: null }));
      }
    } catch {
      setCredentials((prev) => ({ ...prev, [platform]: null }));
    } finally {
      setLoading((prev) => ({ ...prev, [platform]: false }));
    }
  }

  function handleCopy(text: string, field: string) {
    copy(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/50">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Platform</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Password</TableHead>
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {PLATFORMS.map((platform) => {
            const cred = credentials[platform];
            const isLoading = loading[platform];
            const isRevealed = revealed[platform];

            return (
              <TableRow key={platform}>
                <TableCell>
                  <Badge variant="outline" className={cn('capitalize', PLATFORM_COLORS[platform])}>
                    {platform}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {cred?.email ?? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isLoading}
                      onClick={() => fetchCredential(platform)}
                      className="text-amber-400/70 hover:bg-amber-500/10 hover:text-amber-300"
                    >
                      {isLoading ? 'Loading...' : 'Load'}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {cred ? (
                    isRevealed ? (
                      <span className="text-amber-200/80">{cred.password}</span>
                    ) : (
                      '••••••••••••'
                    )
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  {cred && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-amber-500/10 hover:text-amber-300"
                        onClick={() =>
                          setRevealed((prev) => ({
                            ...prev,
                            [platform]: !prev[platform]
                          }))
                        }
                      >
                        {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-amber-500/10 hover:text-amber-300"
                        onClick={() => handleCopy(cred.password, `${platform}-pw`)}
                      >
                        {copiedField === `${platform}-pw` ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
