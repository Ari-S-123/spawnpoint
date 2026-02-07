'use client';

import { useState } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import type { Platform, PlatformCredential } from '@/types';

const PLATFORMS: Platform[] = ['vercel', 'sentry', 'mintlify', 'instagram', 'tiktok', 'twitter'];

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
    <div className="rounded-lg border">
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
                  <Badge variant="outline" className="capitalize">
                    {platform}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {cred?.email ?? (
                    <Button variant="ghost" size="sm" disabled={isLoading} onClick={() => fetchCredential(platform)}>
                      {isLoading ? 'Loading...' : 'Load'}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {cred ? (isRevealed ? cred.password : '••••••••••••') : '—'}
                </TableCell>
                <TableCell>
                  {cred && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
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
                        className="h-8 w-8"
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
