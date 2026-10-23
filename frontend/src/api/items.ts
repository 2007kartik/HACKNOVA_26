/**
 * Items API Endpoints
 * Adheres strictly to ANTIGRAVITY_FRONTEND_IMPLEMENTATION_BRIEF.md
 */

import { apiClient } from './client';
import { Item, AuditEntry, normalizeItem, ItemType, CommitmentLevel } from '../types/api';

export interface EditItemPayload {
  title?: string;
  description?: string | null;
  owner?: string | null;
  deadline?: string | null;
  type?: ItemType;
  commitment_level?: CommitmentLevel;
}

export interface ClarifyPayload {
  field: string;
  answer: string;
}

export const itemsApi = {
  getItems: async (meetingId: string, filters?: { type?: string; status?: string }): Promise<Item[]> => {
    const rawItems = await apiClient.get<any[]>(
      `/meetings/${encodeURIComponent(meetingId)}/items`,
      filters
    );
    if (!Array.isArray(rawItems)) return [];
    return rawItems.map(normalizeItem);
  },

  editItem: async (id: string, payload: EditItemPayload): Promise<Item> => {
    // Send only documented fields
    const cleanPayload: Record<string, any> = {};
    if (payload.title !== undefined) cleanPayload.title = payload.title;
    if (payload.description !== undefined) cleanPayload.description = payload.description;
    if (payload.owner !== undefined) cleanPayload.owner = payload.owner;
    if (payload.deadline !== undefined) cleanPayload.deadline = payload.deadline;
    if (payload.type !== undefined) cleanPayload.type = payload.type;
    if (payload.commitment_level !== undefined) cleanPayload.commitment_level = payload.commitment_level;

    const data = await apiClient.patch<any>(`/items/${encodeURIComponent(id)}`, cleanPayload);
    return normalizeItem(data);
  },

  approveItem: async (id: string, actor: string): Promise<Item> => {
    const data = await apiClient.post<any>(`/items/${encodeURIComponent(id)}/approve`, { actor });
    return normalizeItem(data);
  },

  rejectItem: async (id: string, actor: string, reason: string): Promise<Item> => {
    const data = await apiClient.post<any>(`/items/${encodeURIComponent(id)}/reject`, { actor, reason });
    return normalizeItem(data);
  },

  unapproveItem: async (id: string, actor: string): Promise<Item> => {
    const data = await apiClient.post<any>(`/items/${encodeURIComponent(id)}/unapprove`, { actor });
    return normalizeItem(data);
  },

  clarifyItem: async (id: string, payload: ClarifyPayload): Promise<Item> => {
    const data = await apiClient.post<any>(`/items/${encodeURIComponent(id)}/clarify`, payload);
    return normalizeItem(data);
  },

  getItemAudit: async (id: string): Promise<AuditEntry[]> => {
    const data = await apiClient.get<AuditEntry[]>(`/items/${encodeURIComponent(id)}/audit`);
    return Array.isArray(data) ? data : [];
  },
};
