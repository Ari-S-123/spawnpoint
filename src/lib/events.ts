import { EventEmitter } from 'events';
import type { TaskStatusEvent } from '@/types';

let emitter: EventEmitter | undefined;

export function getTaskEventEmitter(): EventEmitter {
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(100);
  }
  return emitter;
}

export function emitTaskUpdate(event: TaskStatusEvent): void {
  getTaskEventEmitter().emit('task-update', event);
}
