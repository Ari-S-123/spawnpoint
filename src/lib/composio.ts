import { ComposioToolSet } from 'composio-core';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

// Lazy initialization to avoid build-time errors when COMPOSIO_API_KEY is unset
let _toolset: ComposioToolSet | null = null;
function getToolset(): ComposioToolSet {
  if (!_toolset) {
    _toolset = new ComposioToolSet({
      apiKey: process.env.COMPOSIO_API_KEY ?? null
    });
  }
  return _toolset;
}

/**
 * Connects an Instagram account to Composio using the agent's email/password credentials.
 * This must be called after signup completes so the agent can post via the API.
 */
export async function connectInstagramAccount(
  email: string,
  password: string,
  entityId: string
): Promise<{ success: boolean; connectedAccountId?: string; error?: string }> {
  try {
    console.log(`[composio] Connecting Instagram for entity ${entityId}...`);

    const connectionRequest = await getToolset().connectedAccounts.initiate({
      appName: 'instagram',
      authMode: 'BASIC',
      connectionParams: {
        username: email,
        password: password
      },
      entityId
    });

    console.log(`[composio] Connection initiated, status: ${connectionRequest.connectionStatus}`);

    if (connectionRequest.connectionStatus === 'ACTIVE') {
      console.log(`[composio] Instagram connected: ${connectionRequest.connectedAccountId}`);
      return { success: true, connectedAccountId: connectionRequest.connectedAccountId };
    }

    // Wait for the connection to become active (up to 30s)
    const account = await connectionRequest.waitUntilActive(30_000);
    console.log(`[composio] Instagram connection active: ${account.id}`);

    return { success: true, connectedAccountId: account.id };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown Composio connection error';
    console.error('[composio] Instagram connection failed:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

const model = anthropic('claude-opus-4-6');

/**
 * Uses AI to generate a compelling first-post caption for a new Instagram account.
 */
export async function generateFirstPostCaption(agentName: string): Promise<string> {
  const { text } = await generateText({
    model,
    prompt: `You are a creative social media manager. Write a short, punchy Instagram caption (under 150 characters) for the very first post of a new account called "${agentName}". 
The tone should be confident and modern. Include 2-3 relevant hashtags. 
Return ONLY the caption text, nothing else.`
  });

  return text.trim();
}

/**
 * Finds a high-quality, publicly-accessible image URL suitable for an Instagram post.
 * Uses Lorem Picsum which provides direct-access photo URLs.
 */
export function getFirstPostImageUrl(agentName: string): string {
  // Use a seeded Picsum image so it's deterministic per agent but still unique.
  // The seed ensures the same agent always gets the same welcome image.
  // 1080x1080 is Instagram's ideal square post resolution.
  const seed = encodeURIComponent(agentName);
  return `https://picsum.photos/seed/${seed}/1080/1080.jpg`;
}

/**
 * Creates and publishes an Instagram post using Composio.
 *
 * Instagram's API requires a two-step process:
 * 1. Create a media container (upload image + caption)
 * 2. Publish the container as a post
 */
export async function createInstagramPost(
  imageUrl: string,
  caption: string,
  entityId?: string
): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    // Step 1: Create a media container
    const containerResponse = await getToolset().executeAction({
      action: 'INSTAGRAM_CREATE_MEDIA_CONTAINER',
      params: {
        image_url: imageUrl,
        caption
      },
      entityId: entityId ?? 'default'
    });

    const containerId =
      (containerResponse as Record<string, unknown>)?.data &&
      ((containerResponse as Record<string, unknown>).data as Record<string, unknown>)?.id;

    if (!containerId) {
      console.error('[composio] Failed to create media container:', containerResponse);
      return {
        success: false,
        error: 'Failed to create media container — no container ID returned.'
      };
    }

    console.log(`[composio] Media container created: ${containerId}`);

    // Step 2: Poll until the container is ready (Instagram needs processing time)
    let ready = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5_000)); // wait 5s between polls

      try {
        const statusResponse = await getToolset().executeAction({
          action: 'INSTAGRAM_GET_POST_STATUS',
          params: { creation_id: containerId },
          entityId: entityId ?? 'default'
        });

        const status =
          (statusResponse as Record<string, unknown>)?.data &&
          ((statusResponse as Record<string, unknown>).data as Record<string, unknown>)?.status_code;

        if (status === 'FINISHED') {
          ready = true;
          break;
        }

        console.log(`[composio] Container ${containerId} status: ${status ?? 'unknown'} (attempt ${attempt + 1}/6)`);
      } catch {
        // Status check failed — continue polling
        console.log(`[composio] Status check attempt ${attempt + 1} failed, retrying...`);
      }
    }

    if (!ready) {
      // Try publishing anyway — the Composio action has built-in retry logic
      console.log('[composio] Container may not be FINISHED, attempting publish anyway...');
    }

    // Step 3: Publish the post
    const publishResponse = await getToolset().executeAction({
      action: 'INSTAGRAM_CREATE_POST',
      params: {
        creation_id: containerId
      },
      entityId: entityId ?? 'default'
    });

    console.log('[composio] Post published:', publishResponse);

    return {
      success: true,
      result: publishResponse as Record<string, unknown>
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown Composio error';
    console.error('[composio] Instagram post failed:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Full first-post workflow: generates caption via AI, picks an image, and posts.
 */
export async function publishFirstPost(
  agentName: string,
  entityId?: string
): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  const caption = await generateFirstPostCaption(agentName);
  const imageUrl = getFirstPostImageUrl(agentName);

  console.log(`[composio] Publishing first post for "${agentName}"`);
  console.log(`[composio] Caption: ${caption}`);
  console.log(`[composio] Image: ${imageUrl}`);

  return createInstagramPost(imageUrl, caption, entityId);
}
