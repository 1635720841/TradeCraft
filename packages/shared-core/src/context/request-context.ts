export enum Role {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

/** 每个 HTTP 请求的请求上下文（从 JWT/Guard 填充，禁止从 body 读取 tenant ID） */
export interface RequestContext {
  traceId: string;
  userId: string;
  organizationId: string;
  projectId?: string;
  role: Role;
}
