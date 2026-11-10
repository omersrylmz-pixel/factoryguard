// Backend Pydantic şemalarının TypeScript karşılıkları.

export type Role = "owner" | "admin" | "analyst" | "viewer";
export type Criticality = "low" | "medium" | "high" | "critical";

export interface OrgMembership {
  id: string;
  name: string;
  role: Role;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
}

export interface MeResponse {
  user: User;
  organizations: OrgMembership[];
}

export interface TokenResponse extends MeResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Organization {
  id: string;
  name: string;
  plan: string;
  created_at: string;
  role: Role;
}

export interface Member {
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export interface Site {
  id: string;
  organization_id: string;
  name: string;
  industry: string | null;
  timezone: string;
  created_at: string;
}

export interface Zone {
  id: string;
  organization_id: string;
  site_id: string;
  name: string;
  description: string | null;
  criticality: Criticality;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
}
