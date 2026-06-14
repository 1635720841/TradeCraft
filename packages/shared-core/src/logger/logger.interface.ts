export interface LogPayload {
  traceId?: string;
  organizationId?: string;
  projectId?: string;
  action?: string;
  [key: string]: unknown;
}

export interface ILogger {
  info(message: string, payload?: LogPayload): void;
  warn(message: string, payload?: LogPayload): void;
  error(message: string, payload?: LogPayload): void;
  debug(message: string, payload?: LogPayload): void;
}
