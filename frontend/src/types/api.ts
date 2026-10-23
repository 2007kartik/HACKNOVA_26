/**
 * TypeScript API Types and Normalizers
 * Adheres strictly to ANTIGRAVITY_FRONTEND_IMPLEMENTATION_BRIEF.md
 */

export type MeetingStatus = 'CREATED' | 'EXTRACTING' | 'EXTRACTED' | 'FAILED';

export type ItemType = 
  | 'ACTION_ITEM'
  | 'DECISION'
  | 'SUGGESTION'
  | 'OPEN_QUESTION'
  | 'FOLLOW_UP';

export type CommitmentLevel = 
  | 'CONFIRMED'
  | 'PROPOSED'
  | 'UNRESOLVED';

export type ItemStatus = 
  | 'EXTRACTED'
  | 'NEEDS_CLARIFICATION'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SYNCED'
  | 'DONE';

export type AmbiguityFlag = 
  | 'NO_OWNER'
  | 'VAGUE_OWNER'
  | 'MULTIPLE_OWNERS'
  | 'VAGUE_DEADLINE'
  | 'NO_DEADLINE';

export type DuplicateRelation = 
  | 'DUPLICATE'
  | 'CONFLICT'
  | 'RELATED';

export type DuplicateResolution = 
  | 'PENDING'
  | 'MERGED'
  | 'KEPT_BOTH'
  | 'REJECTED_ONE';

export type DuplicateActionType = 
  | 'merge'
  | 'keep_both'
  | 'reject_one';

export interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string[];
  raw_text?: string;
  status: MeetingStatus;
  created_at?: string;
  error_message?: string | null;
  items_count?: number;
}

export interface Item {
  id: string;
  meeting_id: string;
  type: ItemType;
  commitment_level: CommitmentLevel;
  title: string;
  description?: string | null;
  owner?: string | null;
  owner_resolved?: string | null;
  owner_raw?: string | null;
  deadline?: string | null;
  deadline_resolved?: string | null;
  deadline_raw?: string | null;
  evidence_quote?: string | null;
  speaker?: string | null;
  confidence: number;
  flags: AmbiguityFlag[];
  ambiguity_flags?: AmbiguityFlag[];
  status: ItemStatus;
  reasoning?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  created_at?: string;
  updated_at?: string;
  duplicate_links?: string[];
}

export interface DuplicateLink {
  id: string;
  relation: DuplicateRelation;
  score: number;
  explanation?: string;
  resolution: DuplicateResolution;
  item_a: Item;
  item_b: Item;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  trello_member_id?: string | null;
  github_login?: string | null;
  created_at?: string;
}

export interface AuditEntry {
  id?: string;
  action: string;
  actor: string;
  timestamp: string;
  diff?: Record<string, { old?: any; new?: any } | any> | null;
  details?: Record<string, any> | null;
  reason?: string;
}

export interface PushPreviewCard {
  item_id?: string;
  id?: string;
  title: string;
  owner?: string | null;
  deadline?: string | null;
  reason?: string | null;
  card_url?: string | null;
  url?: string | null;
  details?: any;
}

export interface PushResponse {
  pushed: PushPreviewCard[];
  failed: PushPreviewCard[];
  dry_run?: boolean;
}

export interface BulkApproveResponse {
  approved: (string | Item)[];
  skipped: Array<{
    item_id?: string;
    id?: string;
    title?: string;
    reason: string;
  }>;
}

export interface SyncResponse {
  synced_to_done: number;
  items_checked: number;
  message?: string;
}

export interface DashboardResponse {
  status_counts?: Record<ItemStatus, number>;
  counts?: Record<string, number>;
  awaiting_clarification?: number;
  overdue: Item[];
  unassigned: Item[];
  pending: (Item & { meeting_title?: string })[];
}

export interface ApiErrorDetail {
  code?: string;
  message: string;
  details?: Record<string, any>;
}

export interface NormalizedApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Normalizes an Item from the backend to ensure backward compatibility
 * between flags/ambiguity_flags and owner/owner_resolved fields.
 */
export function normalizeItem(raw: any): Item {
  const flags = Array.isArray(raw.flags) 
    ? raw.flags 
    : (Array.isArray(raw.ambiguity_flags) ? raw.ambiguity_flags : []);
    
  const owner = raw.owner || raw.owner_resolved || raw.owner_raw || null;
  const deadline = raw.deadline || raw.deadline_resolved || raw.deadline_raw || null;

  return {
    ...raw,
    flags,
    owner,
    deadline,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 1.0,
  };
}
