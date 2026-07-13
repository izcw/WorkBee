export type MessageKind = 'request' | 'response' | 'event';

export interface ProtocolError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface Envelope<T extends Record<string, unknown> = Record<string, unknown>> {
  protocolVersion: 1;
  id: string;
  kind: MessageKind;
  type: string;
  timestamp: string;
  requestId?: string;
  runId?: string;
  sequence?: number;
  payload: T;
  error?: ProtocolError;
}
