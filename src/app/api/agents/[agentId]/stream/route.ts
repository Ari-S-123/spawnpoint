import { NextRequest } from 'next/server';
import { getTaskEventEmitter } from '@/lib/events';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<Response> {
  const { agentId } = await params;
  const emitter = getTaskEventEmitter();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const handler = (event: { agentId: string; [key: string]: unknown }): void => {
        if (event.agentId === agentId) {
          send(event);
        }
      };

      emitter.on('task-update', handler);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 30_000);

      request.signal.addEventListener('abort', () => {
        emitter.off('task-update', handler);
        clearInterval(heartbeat);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
