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

export interface Sensor {
  id: string;
  organization_id: string;
  site_id: string;
  name: string;
  version: string;
  status: "active" | "offline" | "revoked";
  connectivity_status: "active" | "offline" | "revoked";
  is_connected: boolean;
  credential_fingerprint: string;
  last_seen_at: string | null;
  created_at: string;
}

export interface SensorEnrollResponse extends Sensor {
  sensor_token: string;
}

export interface DiscoveryRun {
  id: string;
  sensor_id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  devices_seen: number;
}

export interface SensorDetail extends Sensor {
  recent_runs: DiscoveryRun[];
}

export type AssetType =
  | "plc"
  | "hmi"
  | "scada_server"
  | "industrial_pc"
  | "network_device"
  | "engineering_workstation"
  | "server"
  | "computer"
  | "unknown_device";

export interface Asset {
  id: string;
  organization_id: string;
  site_id: string;
  zone_id: string | null;
  name: string | null;
  ip_address: string | null;
  mac_address: string | null;
  hostname: string | null;
  asset_type: AssetType;
  vendor: string | null;
  model: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  criticality: Criticality;
  confidence: number;
  is_verified: boolean;
  is_active: boolean;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  classification_label: string;
  vendor_status_label: string;
}

export interface AssetIdentifier {
  id: string;
  identifier_type: "ip" | "mac" | "hostname";
  identifier_value: string;
  first_seen_at: string;
  last_seen_at: string;
  confidence: number;
}

export interface AssetObservation {
  id: string;
  sensor_id: string;
  source: string;
  evidence: Record<string, unknown>;
  confidence: number;
  observed_at: string;
}

export interface AssetCommunication {
  id: string;
  direction: "outbound" | "inbound";
  peer_asset_id: string;
  peer_ip: string | null;
  peer_name: string | null;
  protocol: string;
  source_port: number | null;
  target_port: number | null;
  connection_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

export interface AssetDetail extends Asset {
  classification_reasons: string[];
  identifiers: AssetIdentifier[];
  observations: AssetObservation[];
  communications: AssetCommunication[];
}

export interface CsvImportResult {
  processed_rows: number;
  created: number;
  updated: number;
  errors: { row: number; error: string }[];
}
