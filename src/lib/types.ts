export type Role = 'ADMIN' | 'OWNER' | 'STAFF';
export type SpotStatus = 'AVAILABLE' | 'RENTED' | 'EXPIRING' | 'EXPIRED' | 'INACTIVE';
export type SpotType = 'STANDARD' | 'VIP' | 'SHADED' | 'OUTSIDE';
export type SpotKind = 'INCLUDED' | 'PAID';
export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'RENEWED' | 'EXPIRED' | 'TERMINATED';
export type Channel = 'IN_APP' | 'EMAIL' | 'WHATSAPP' | 'SMS';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: string;
  phone: string | null;
  receiveReminders: boolean;
  isActive?: boolean;
  lastLoginAt?: string | null;
}
export interface TenantRef {
  id: string;
  nameAr: string;
  nameEn: string | null;
  code: string | null;
}

export interface Geometry {
  points: [number, number][];
  cx: number;
  cy: number;
}

export interface FloorStats {
  total: number;
  AVAILABLE: number;
  RENTED: number;
  EXPIRING: number;
  EXPIRED: number;
  INACTIVE: number;
  occupied: number;
  occupancyRate: number;
}

export interface Floor {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  level: number;
  kind: 'INDOOR' | 'OUTDOOR';
  svgPath: string | null;
  viewBox: [number, number, number, number] | null;
  officialCapacity: number | null;
  sourceFile: string | null;
  notes: string | null;
  stats?: FloorStats;
  allocatedUnnumbered?: number;
}

export interface SpotState {
  status: SpotStatus;
  kind?: SpotKind;
  daysLeft?: number;
  contract?: { id: string; number: string; startDate: string; endDate: string; status: ContractStatus; needsReview: boolean };
  tenant?: TenantRef;
}

export interface MapSpot extends SpotState {
  id: string;
  label: string;
  number: number | null;
  type: SpotType;
  geometry: Geometry | null;
  geometrySource: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface FloorMap {
  floor: Floor;
  stats: FloorStats;
  spots: MapSpot[];
  allocations: { id: string; quantity: number; kind: SpotKind; contract: { id: string; number: string; endDate: string; tenant: TenantRef } }[];
}

export interface Contact {
  id: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  isPrimary: boolean;
  receiveReminders: boolean;
}

export interface TenantListItem extends TenantRef {
  officeUnits: string | null;
  email: string | null;
  phone: string | null;
  minSpots: number;
  status: 'ACTIVE' | 'INACTIVE';
  primaryContact: Contact | null;
  activeContracts: number;
  spotCount: number;
  numberedSpots: number;
  unnumberedSpots: number;
  belowMinimum: boolean;
  needsReview: boolean;
  nextExpiry: string | null;
  daysToExpiry: number | null;
}

export interface ContractSpotLine {
  id: string;
  kind: SpotKind;
  annualPrice: string;
  spot: { id: string; label: string; type: SpotType; floor: { code: string; nameAr: string; nameEn: string } };
}
export interface AllocationLine {
  id: string;
  quantity: number;
  kind: SpotKind;
  annualPrice: string;
  floor: { code: string; nameAr: string; nameEn: string };
}

export interface Delivery {
  id: string;
  channel: Channel;
  recipient: string;
  recipientType: string;
  status: string;
  error: string | null;
  daysBefore: number | null;
  createdAt: string;
  sentAt: string | null;
  subject?: string | null;
  contract?: { number: string; tenant: { nameAr: string } } | null;
}

export interface Contract {
  id: string;
  number: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  annualAmount: string;
  currency: string;
  needsReview: boolean;
  notes: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  daysLeft: number;
  createdAt: string;
  tenant: TenantRef & { minSpots?: number };
  spots?: ContractSpotLine[];
  allocations?: AllocationLine[];
  renewedFrom?: { id: string; number: string } | null;
  renewedBy?: { id: string; number: string } | null;
  spotCount?: number;
  deliveries?: Delivery[];
}

export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface Settings {
  buildingName: { ar: string; en: string };
  currency: string;
  pricing: Record<SpotType, number>;
  expiringThresholdDays: number;
  minSpotsPerTenant: number;
  ownerEmails: string[];
  contractNumberPrefix: string;
}

export interface ImportIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  row?: number;
  column?: string;
  tenant?: string;
}

export const PERMISSION_KEYS = [
  'contracts.create', 'contracts.update', 'contracts.renew', 'contracts.terminate',
  'tenants.create', 'tenants.update', 'tenants.delete', 'spots.edit', 'imports.commit', 'settings.update',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export interface EffectivePermission {
  permission: PermissionKey;
  allowed: boolean;
  requiresApproval: boolean;
  approverId: string | null;
  approver: { id: string; name: string; email: string } | null;
  source: 'role' | 'custom';
  locked: boolean;
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'FAILED';
export interface ApprovalPerson {
  id: string;
  name: string;
  email: string;
  role: Role;
}
export interface ApprovalRequest {
  id: string;
  permission: PermissionKey;
  method: string;
  routePath: string;
  params: Record<string, string>;
  body: Record<string, unknown>;
  summary: { ar: string; en: string };
  status: ApprovalStatus;
  requester: ApprovalPerson;
  approver: ApprovalPerson;
  decisionNote: string | null;
  decidedAt: string | null;
  error: string | null;
  createdAt: string;
}
