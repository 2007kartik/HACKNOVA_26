/**
 * Duplicates API Endpoints
 * Adheres strictly to ANTIGRAVITY_FRONTEND_IMPLEMENTATION_BRIEF.md
 */

import { apiClient } from './client';
import { DuplicateLink, DuplicateActionType, normalizeItem } from '../types/api';

export interface ResolveDuplicatePayload {
  action: DuplicateActionType;
  keep_item_id?: string;
}

export const duplicatesApi = {
  getDuplicates: async (meetingId: string): Promise<DuplicateLink[]> => {
    const rawLinks = await apiClient.get<any[]>(
      `/meetings/${encodeURIComponent(meetingId)}/duplicates`
    );
    if (!Array.isArray(rawLinks)) return [];
    
    return rawLinks.map((link) => ({
      ...link,
      item_a: normalizeItem(link.item_a),
      item_b: normalizeItem(link.item_b),
    }));
  },

  resolveDuplicate: async (
    linkId: string,
    action: DuplicateActionType,
    keepItemId?: string
  ): Promise<DuplicateLink> => {
    const payload: ResolveDuplicatePayload = { action };
    if (keepItemId && (action === 'merge' || action === 'reject_one')) {
      payload.keep_item_id = keepItemId;
    }

    const data = await apiClient.post<any>(
      `/duplicates/${encodeURIComponent(linkId)}/resolve`,
      payload
    );
    return {
      ...data,
      item_a: data.item_a ? normalizeItem(data.item_a) : undefined,
      item_b: data.item_b ? normalizeItem(data.item_b) : undefined,
    };
  },
};
