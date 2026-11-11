import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export interface ExecutionEvent {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
}

export function publishExecutionEvent(executionId: string, type: string, data: Record<string, unknown> = {}): void {
  const event: ExecutionEvent = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type, createdAt: new Date().toISOString(), data };
  emitter.emit(executionId, event);
}

export function subscribeExecutionEvents(executionId: string, listener: (event: ExecutionEvent) => void): () => void {
  emitter.on(executionId, listener);
  return () => emitter.off(executionId, listener);
}
