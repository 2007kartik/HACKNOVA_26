/**
 * Application Configuration & Constants
 * Adheres strictly to ANTIGRAVITY_FRONTEND_IMPLEMENTATION_BRIEF.md
 */

export const APP_CONFIG = {
  appName: 'MeetingFlow',
  tagline: 'Meeting-to-Execution Automation',
  subTagline: 'AI proposes; a human reviews and approves; only eligible approved work is pushed.',
  badge: 'AI',
  
  // API Base URL from Vite environment variable with safe development fallback
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://10.75.138.96:8000',
  
  // Single configurable demo actor for approve/reject/unapprove/bulk audit actions
  defaultActor: 'demo-user@hacknova.internal',
  
  // Extraction polling settings
  pollingIntervalMs: 2000,
  pollingTimeoutMs: 120000, // 2 minutes timeout safeguard
  
  // Default items per page or filters
  defaultTarget: 'trello' as const,
};

/**
 * Clarification flag to field mapping adapter.
 * Bridges ambiguity flags to the field name accepted by POST /items/{id}/clarify.
 */
export const FLAG_TO_FIELD_MAP: Record<string, { field: string; label: string; placeholder: string; isDate?: boolean }> = {
  NO_OWNER: { field: 'owner', label: 'Assign an owner', placeholder: 'e.g. Alice Chen' },
  VAGUE_OWNER: { field: 'owner', label: 'Clarify specific owner', placeholder: 'e.g. Bob Smith' },
  MULTIPLE_OWNERS: { field: 'owner', label: 'Select primary owner', placeholder: 'e.g. Alice Chen' },
  NO_DEADLINE: { field: 'deadline', label: 'Specify deadline (YYYY-MM-DD)', placeholder: 'YYYY-MM-DD', isDate: true },
  VAGUE_DEADLINE: { field: 'deadline', label: 'Specify exact deadline (YYYY-MM-DD)', placeholder: 'YYYY-MM-DD', isDate: true },
};
