/**
 * Dashboard & Sync API Endpoints
 * Adheres strictly to ANTIGRAVITY_FRONTEND_IMPLEMENTATION_BRIEF.md
 */

import { apiClient } from './client';
import { DashboardResponse, SyncResponse, normalizeItem } from '../types/api';

export const dashboardApi = {
  getDashboard: async (meetingId?: string): Promise<DashboardResponse> => {
    const rawData = await apiClient.get<any>('/dashboard', meetingId ? { meeting_id: meetingId } : undefined);
    
    // Normalize lists safely
    const overdue = Array.isArray(rawData?.overdue) 
      ? rawData.overdue.map(normalizeItem) 
      : [];
    const unassigned = Array.isArray(rawData?.unassigned) 
      ? rawData.unassigned.map(normalizeItem) 
      : [];
    const rawPending = rawData?.pending || rawData?.pending_from_previous_meetings;
    const pending = Array.isArray(rawPending) 
      ? rawPending.map((item: any) => ({
          ...normalizeItem(item),
          meeting_title: item.meeting_title || 'Previous Meeting',
        })) 
      : [];

    return {
      status_counts: rawData?.status_counts || rawData?.counts || {},
      counts: rawData?.counts || rawData?.status_counts || {},
      awaiting_clarification: rawData?.awaiting_clarification || 0,
      overdue,
      unassigned,
      pending,
    };
  },

  syncWithTrello: async (): Promise<SyncResponse> => {
    return apiClient.post<SyncResponse>('/sync');
  },
};
