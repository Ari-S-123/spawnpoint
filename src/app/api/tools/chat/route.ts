import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai';
import { z } from 'zod/v4';
import { auth } from '@/lib/auth/server';
import { searchTools, callTool, getAvailableKeys } from '@/lib/wisp';
import { getComposioTools, executeComposioTool, getAgentIntegrations } from '@/lib/composio';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { COMPOSIO_APP_CONFIG } from '@/types';

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: Request) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages, agentId } = await request.json();
  const modelMessages = await convertToModelMessages(messages);

  // Build dynamic system prompt with connected integrations
  let connectedAppsSection = '';
  if (agentId) {
    try {
      const integrationRows = await getAgentIntegrations(agentId);
      const connected = integrationRows.filter((r) => r.status === 'connected');
      if (connected.length > 0) {
        const appNames = connected.map((r) => COMPOSIO_APP_CONFIG[r.app]?.name ?? r.app).join(', ');
        connectedAppsSection =
          `\n\n**Connected Composio apps for this agent:** ${appNames}\n` +
          'These apps are fully authenticated via OAuth. Composio handles ALL auth details (account IDs, tokens, credentials) automatically.\n' +
          'NEVER ask the user for account IDs, API keys, tokens, or business account IDs — just call the action with the content parameters only.\n' +
          'When the user asks to do something involving these services, ALWAYS use composio_list_tools first to discover ' +
          'available actions, then composio_execute_tool to execute. Do NOT tell the user to do things manually — you can do it directly.\n';
      }
    } catch {
      // If we can't fetch integrations, continue without the hint
    }
  }

  const systemPrompt = [
    'You are an autonomous tool execution agent. You complete tasks end-to-end without asking the user for information you can obtain via tools.',
    '',
    '## Two Tool Backends',
    '',
    '**Wisp (MCP tools)** — general-purpose tools (web search, image generation, file hosting, scraping, etc.)',
    '- search_tools → find tools by keyword',
    '- execute_tool → run a tool',
    '',
    '**Composio (OAuth integrations)** — actions on connected services (post to social media, send emails, create repos, etc.)',
    '- composio_list_tools → discover available actions for connected apps',
    '- composio_execute_tool → execute an action',
    '',
    '## Critical Rules',
    '',
    '1. **Composio handles ALL authentication automatically.** Never ask the user for account IDs, user IDs, business account IDs, API keys, tokens, or any credential. Just pass the content parameters (text, caption, URLs, etc.). Composio resolves the authenticated user internally.',
    '2. **Always act, never defer.** Do not tell the user "you\'ll need to..." or "here\'s what you can do...". Just do it. Chain multiple tool calls to complete the full workflow.',
    '3. **Chain tools across backends.** Example workflow for posting an image to Instagram:',
    '   - search_tools("image hosting" or "file upload" or "imgur") → find a hosting tool',
    '   - execute_tool → upload/host the image → get a public URL',
    '   - composio_list_tools(["instagram"]) → discover Instagram actions',
    '   - composio_execute_tool → create the post with the public image URL and caption',
    '4. **For images needed in posts:** If you need a publicly accessible image URL, search Wisp for image hosting/upload tools. If no hosting tool is available, use a relevant stock image from unsplash (https://images.unsplash.com/photo-...) as a fallback.',
    '5. **Prefer Composio** for any task involving a connected app. Prefer Wisp for everything else.',
    connectedAppsSection,
    '',
    'Always search/list tools before executing to pick the right one. Explain results concisely with markdown formatting.',
    '',
    '## Reasoning Transparency',
    'Before each tool call, briefly explain WHY you chose that tool and what you expect to learn or accomplish.',
    'After a tool returns results, give a concise summary of what you found before moving on.'
  ].join('\n');

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    stopWhen: stepCountIs(10),
    system: systemPrompt,
    messages: modelMessages,
    providerOptions: {
      anthropic: { thinking: { type: 'enabled', budgetTokens: 4096 } }
    },
    tools: {
      search_tools: tool({
        description: 'Search for available MCP tools by keyword or description',
        inputSchema: z.object({
          query: z.string().describe('Search query to find relevant tools')
        }),
        execute: async ({ query }) => {
          const [result, availableKeys] = await Promise.all([
            searchTools(query, 1, 10),
            getAvailableKeys().catch(() => [] as string[])
          ]);
          return result.results.map((t) => ({
            name: t.name,
            description: t.description,
            server_name: t.server.name,
            input_schema: t.input_schema,
            requires_auth: t.requires_auth,
            auth_ready: !t.requires_auth || availableKeys.length > 0,
            score: t.score
          }));
        }
      }),
      execute_tool: tool({
        description: 'Execute an MCP tool on a specific server with the given arguments',
        inputSchema: z.object({
          server_name: z.string().describe('The server that hosts the tool'),
          tool_name: z.string().describe('The name of the tool to execute'),
          arguments: z.record(z.string(), z.unknown()).describe('Arguments to pass to the tool')
        }),
        execute: async ({
          server_name,
          tool_name,
          arguments: args
        }: {
          server_name: string;
          tool_name: string;
          arguments: Record<string, unknown>;
        }) => {
          const result = await callTool({ server_name, tool_name, arguments: args });

          await db.insert(auditLog).values({
            operatorId: session.user.id,
            action: 'tool_call',
            resourceId: `${server_name}/${tool_name}`
          });

          return result;
        }
      }),
      composio_list_tools: tool({
        description:
          "List available Composio tools/actions for this agent's connected OAuth apps (Gmail, GitHub, etc.). " +
          'Optionally filter by app names.',
        inputSchema: z.object({
          apps: z
            .array(z.string())
            .optional()
            .describe('Optional list of app names to filter by (e.g. ["gmail", "github"])')
        }),
        execute: async ({ apps }: { apps?: string[] }) => {
          if (!agentId) {
            return { error: 'No agent context — Composio tools require an agent with connected integrations.' };
          }
          const tools = await getComposioTools(agentId, apps);
          if (tools.length === 0) {
            return { message: 'No connected Composio apps found. Connect apps in the Integrations tab first.' };
          }
          return tools;
        }
      }),
      composio_execute_tool: tool({
        description: 'Execute a Composio action/tool on a connected OAuth app',
        inputSchema: z.object({
          action_name: z.string().describe('The Composio action name to execute'),
          arguments: z.record(z.string(), z.unknown()).describe('Arguments to pass to the action')
        }),
        execute: async ({
          action_name,
          arguments: args
        }: {
          action_name: string;
          arguments: Record<string, unknown>;
        }) => {
          if (!agentId) {
            return { error: 'No agent context — Composio tools require an agent with connected integrations.' };
          }
          const result = await executeComposioTool(agentId, action_name, args);

          await db.insert(auditLog).values({
            operatorId: session.user.id,
            action: 'composio_tool_call',
            resourceId: `composio/${action_name}`
          });

          return result;
        }
      })
    }
  });

  return result.toUIMessageStreamResponse();
}
