'use client';

import { useRef, useEffect, useState, type FormEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReactNode } from 'react';
import {
  Send,
  Search,
  Wrench,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Telescope,
  Github,
  Zap,
  TrendingUp,
  Brain
} from 'lucide-react';
import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const EXAMPLE_PROMPTS = [
  {
    label: 'Find the most popular open-source Vector DB library, scrape its docs, and summarize the top 3 issues',
    icon: Telescope,
    tag: 'Deep Research'
  },
  {
    label: 'Check price of Solana (SOL) and find historical context from the web',
    icon: TrendingUp,
    tag: 'FinTech'
  },
  {
    label: 'List all open issues in modelcontextprotocol/servers and summarize the most recent one',
    icon: Github,
    tag: 'GitHub'
  },
  {
    label: 'Find current news about SpaceX and tell me if they have any launches scheduled',
    icon: Search,
    tag: 'News'
  },
  {
    label: 'Find a tool to generate text-to-speech audio and create a voiceover for: "Welcome to SpawnPoint"',
    icon: Zap,
    tag: 'Creative'
  },
  {
    label: 'What tools can send emails?',
    icon: Wrench,
    tag: 'Discovery'
  }
];

type ToolInvocationPart = {
  type: 'tool-invocation';
  toolInvocation: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    state: 'call' | 'partial-call' | 'result';
    result?: unknown;
  };
};

type TextPart = {
  type: 'text';
  text: string;
};

type ReasoningPart = {
  type: 'reasoning';
  reasoning: string;
};

type StepStartPart = {
  type: 'step-start';
};

type MessagePart = ToolInvocationPart | TextPart | ReasoningPart | StepStartPart | { type: string };

type ActivityEntry =
  | { kind: 'reasoning'; text: string; id: string }
  | { kind: 'tool'; invocation: ToolInvocationPart['toolInvocation']; id: string }
  | { kind: 'step'; stepNumber: number; id: string };

function extractActivityFeed(messages: { parts?: MessagePart[] }[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  let stepCounter = 0;
  for (const msg of messages) {
    if (!msg.parts) continue;
    for (let i = 0; i < msg.parts.length; i++) {
      const part = msg.parts[i]!;
      if (part.type === 'step-start') {
        stepCounter++;
        if (stepCounter > 1) {
          entries.push({ kind: 'step', stepNumber: stepCounter, id: `step-${stepCounter}` });
        }
      } else if (part.type === 'reasoning') {
        const rp = part as ReasoningPart;
        if (rp.reasoning?.trim()) {
          entries.push({ kind: 'reasoning', text: rp.reasoning, id: `reason-${entries.length}` });
        }
      } else if (part.type === 'tool-invocation') {
        const tp = part as ToolInvocationPart;
        entries.push({ kind: 'tool', invocation: tp.toolInvocation, id: tp.toolInvocation.toolCallId });
      }
    }
  }
  return entries;
}


function toolDisplayName(name: string) {
  if (name === 'search_tools') return 'Search Tools';
  if (name === 'execute_tool') return 'Execute Tool';
  if (name === 'composio_list_tools') return 'List Composio Tools';
  if (name === 'composio_execute_tool') return 'Execute Composio Tool';
  return name;
}

function toolIcon(name: string) {
  if (name === 'search_tools' || name === 'composio_list_tools') {
    return <Search className="h-3.5 w-3.5" />;
  }
  return <Wrench className="h-3.5 w-3.5" />;
}

function toolKeyArg(inv: ToolInvocationPart['toolInvocation']): string | null {
  if (inv.toolName === 'search_tools' && typeof inv.args?.query === 'string') {
    return `"${inv.args.query}"`;
  }
  if (inv.toolName === 'execute_tool' && typeof inv.args?.tool_name === 'string') {
    return inv.args.tool_name as string;
  }
  if (inv.toolName === 'composio_list_tools' && Array.isArray(inv.args?.apps)) {
    return (inv.args.apps as string[]).join(', ');
  }
  if (inv.toolName === 'composio_execute_tool' && typeof inv.args?.action_name === 'string') {
    return inv.args.action_name as string;
  }
  return null;
}

/* ── ThinkingBlock ───────────────────────────────────────── */

function ThinkingBlock({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(isStreaming);

  // Auto-expand when streaming starts
  useEffect(() => {
    if (isStreaming) setExpanded(true);
  }, [isStreaming]);

  const previewText = text.length > 120 ? text.slice(0, 120) + '...' : text;

  return (
    <div className={`my-2 rounded-lg border border-amber-500/20 bg-amber-500/5 ${isStreaming ? 'ring-1 ring-amber-500/30' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-amber-400/80 transition-colors hover:text-amber-300"
      >
        {isStreaming ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
        ) : (
          <Brain className="h-3.5 w-3.5 text-amber-400" />
        )}
        <span className="font-medium">{isStreaming ? 'Thinking...' : 'Reasoning'}</span>
        {!expanded && text && (
          <span className="ml-1 truncate max-w-[300px] text-amber-400/50 font-normal">{previewText}</span>
        )}
        {expanded ? <ChevronDown className="ml-auto h-3 w-3 shrink-0" /> : <ChevronRight className="ml-auto h-3 w-3 shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t border-amber-500/10 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {text}
          {isStreaming && <span className="inline-block w-1.5 h-3 bg-amber-400/60 animate-pulse ml-0.5 align-text-bottom" />}
        </div>
      )}
    </div>
  );
}

/* ── InlineToolCard ──────────────────────────────────────── */

function InlineToolCard({ invocation }: { invocation: ToolInvocationPart['toolInvocation'] }) {
  const [expanded, setExpanded] = useState(false);
  const keyArg = toolKeyArg(invocation);
  const isRunning = invocation.state !== 'result';

  return (
    <div className={`my-1.5 rounded-lg border bg-muted/30 ${isRunning ? 'border-blue-500/30 ring-1 ring-blue-500/10' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/50"
      >
        <span className="text-muted-foreground">{toolIcon(invocation.toolName)}</span>
        <span className="font-medium">{toolDisplayName(invocation.toolName)}</span>
        {keyArg && <span className="max-w-[200px] truncate text-muted-foreground">{keyArg}</span>}
        <span className="ml-auto">
          {isRunning ? (
            <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Running
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-green-600/30 px-1.5 py-0 text-[10px] text-green-600">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Done
            </Badge>
          )}
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border/50 px-3 py-2">
          <div>
            <p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Arguments</p>
            <pre className="max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-xs">
              {JSON.stringify(invocation.args, null, 2)}
            </pre>
          </div>
          {invocation.state === 'result' && invocation.result !== undefined && (
            <div>
              <p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Result</p>
              <pre className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-xs">
                {typeof invocation.result === 'string' ? invocation.result : JSON.stringify(invocation.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── StepDivider ─────────────────────────────────────────── */

function StepDivider({ stepNumber }: { stepNumber: number }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <div className="flex-1 border-t border-border/40" />
      <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">Step {stepNumber}</span>
      <div className="flex-1 border-t border-border/40" />
    </div>
  );
}

/* ── ToolActivityCard (sidebar) ──────────────────────────── */

function ToolActivityCard({ invocation }: { invocation: ToolInvocationPart['toolInvocation'] }) {
  const [showArgs, setShowArgs] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const serverName = invocation.args?.server_name as string | undefined;

  return (
    <Card className="gap-2 py-3">
      <CardHeader className="px-3 py-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium">{toolDisplayName(invocation.toolName)}</CardTitle>
          {invocation.state === 'result' ? (
            <Badge variant="outline" className="gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              Done
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </Badge>
          )}
        </div>
        {serverName && <p className="text-xs text-muted-foreground">{serverName}</p>}
      </CardHeader>
      <CardContent className="space-y-1 px-3">
        <button
          onClick={() => setShowArgs(!showArgs)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {showArgs ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Arguments
        </button>
        {showArgs && (
          <pre className="max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-xs">
            {JSON.stringify(invocation.args, null, 2)}
          </pre>
        )}

        {invocation.state === 'result' && invocation.result !== undefined && (
          <>
            <button
              onClick={() => setShowResult(!showResult)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showResult ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Result
            </button>
            {showResult && (
              <pre className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-xs">
                {typeof invocation.result === 'string' ? invocation.result : JSON.stringify(invocation.result, null, 2)}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Markdown renderer ───────────────────────────────────── */

const markdownComponents = {
  h1: ({ children }: { children?: ReactNode }) => <h1 className="mb-2 text-base font-bold">{children}</h1>,
  h2: ({ children }: { children?: ReactNode }) => <h2 className="mt-3 mb-2 text-sm font-bold">{children}</h2>,
  h3: ({ children }: { children?: ReactNode }) => <h3 className="mt-2 mb-1 text-sm font-semibold">{children}</h3>,
  p: ({ children }: { children?: ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="text-sm">{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: ReactNode }) => <em className="italic">{children}</em>,
  code: ({ children, className }: { children?: ReactNode; className?: string }) => {
    const isBlock = className?.includes('language-');
    return isBlock ? (
      <pre className="my-2 overflow-x-auto rounded bg-background/50 p-2 text-xs">
        <code>{children}</code>
      </pre>
    ) : (
      <code className="rounded bg-background/50 px-1 py-0.5 text-xs">{children}</code>
    );
  },
  hr: () => <hr className="my-2 border-border/50" />,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border-b border-border/50 px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => <td className="border-b border-border/30 px-2 py-1">{children}</td>
};

/* ── Main Component ──────────────────────────────────────── */

export function ActionsPanel({ agentId }: { agentId?: string }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/tools/chat',
        body: agentId ? { agentId } : undefined
      }),
    [agentId]
  );
  const { messages, sendMessage, status, error } = useChat({ transport });

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const activityFeed = extractActivityFeed(messages);
  const hasActivity = activityFeed.length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage({ text });
  }

  function handleExampleClick(text: string) {
    sendMessage({ text });
  }

  return (
    <div className="flex h-full">
      {/* Left -- Chat area */}
      <div className="flex flex-1 flex-col">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && !error ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                <h3 className="text-sm font-medium">Ask me to find and run tools</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  I&apos;ll search for MCP tools and execute them on your behalf.
                </p>
              </div>
              <div className="grid max-w-lg grid-cols-2 gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.label}
                    onClick={() => handleExampleClick(prompt.label)}
                    className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center gap-1.5">
                      <prompt.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">{prompt.tag}</span>
                    </div>
                    <span className="line-clamp-2 leading-relaxed">{prompt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">
              {messages.map((message) => {
                let stepCounter = 0;
                const parts = message.parts as MessagePart[] | undefined;
                const isLastMessage = message === messages[messages.length - 1];

                return (
                  <div key={message.id}>
                    {parts?.map((part, i) => {
                      // ── Step dividers ──
                      if (part.type === 'step-start') {
                        stepCounter++;
                        // Skip the first step-start (step 1 is implied)
                        if (stepCounter <= 1) return null;
                        return <StepDivider key={`step-${i}`} stepNumber={stepCounter} />;
                      }

                      // ── Reasoning / thinking blocks ──
                      if (part.type === 'reasoning') {
                        const rp = part as ReasoningPart;
                        if (!rp.reasoning?.trim()) return null;
                        const isStreamingThinking = isLastMessage && isLoading && i === parts.length - 1;
                        return (
                          <ThinkingBlock key={`reasoning-${i}`} text={rp.reasoning} isStreaming={isStreamingThinking} />
                        );
                      }

                      // ── Tool invocations ──
                      if (part.type === 'tool-invocation') {
                        const tp = part as ToolInvocationPart;
                        return <InlineToolCard key={tp.toolInvocation.toolCallId} invocation={tp.toolInvocation} />;
                      }

                      // ── Text parts ──
                      if (part.type === 'text') {
                        const tp = part as TextPart;
                        if (!tp.text?.trim()) return null;
                        return (
                          <div
                            key={`text-${i}`}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                                message.role === 'user'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-foreground'
                              }`}
                            >
                              {message.role === 'user' ? (
                                tp.text
                              ) : (
                                <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                  {tp.text}
                                </Markdown>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                );
              })}

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error.message}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me to find and run a tool..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>

      {/* Right -- Live Activity Feed sidebar */}
      {hasActivity && (
        <div className="w-80 border-l">
          <div className="flex items-center gap-2 border-b p-3">
            {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            <h3 className="text-xs font-medium text-muted-foreground">Activity Feed</h3>
            <span className="text-[10px] text-muted-foreground/60">{activityFeed.length} events</span>
          </div>
          <ScrollArea className="h-[calc(100%-2.5rem)]">
            <div className="p-3">
              {activityFeed.map((entry) => {
                if (entry.kind === 'step') {
                  return (
                    <div key={entry.id} className="flex items-center gap-2 py-2">
                      <div className="flex-1 border-t border-border/30" />
                      <span className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-widest">Step {entry.stepNumber}</span>
                      <div className="flex-1 border-t border-border/30" />
                    </div>
                  );
                }

                if (entry.kind === 'reasoning') {
                  return (
                    <div key={entry.id} className="flex gap-2 py-1.5">
                      <div className="mt-0.5 flex flex-col items-center">
                        <Brain className="h-3 w-3 text-amber-400/70" />
                        <div className="mt-1 flex-1 w-px bg-border/30" />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                        {entry.text}
                      </p>
                    </div>
                  );
                }

                if (entry.kind === 'tool') {
                  return (
                    <ToolActivityCard key={entry.id} invocation={entry.invocation} />
                  );
                }

                return null;
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
