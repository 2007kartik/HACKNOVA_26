/**
 * Meetings API Endpoints
 * Adheres strictly to ANTIGRAVITY_FRONTEND_IMPLEMENTATION_BRIEF.md
 */

import { apiClient } from './client';
import { Meeting, PushResponse, BulkApproveResponse } from '../types/api';

export interface CreateMeetingPayload {
  title: string;
  date: string;
  participants: string[];
  raw_text: string;
}

export const meetingsApi = {
  checkHealth: async (): Promise<{ status: string; version?: string }> => {
    return apiClient.get<{ status: string; version?: string }>('/health');
  },

  listMeetings: async (): Promise<Meeting[]> => {
    const data = await apiClient.get<Meeting[]>('/meetings');
    return Array.isArray(data) ? data : [];
  },

  getMeeting: async (id: string): Promise<Meeting> => {
    return apiClient.get<Meeting>(`/meetings/${encodeURIComponent(id)}`);
  },

  createMeeting: async (payload: CreateMeetingPayload): Promise<Meeting> => {
    return apiClient.post<Meeting>('/meetings', payload);
  },

  triggerExtraction: async (id: string): Promise<{ message?: string; meeting_id?: string }> => {
    return apiClient.post<{ message?: string; meeting_id?: string }>(
      `/meetings/${encodeURIComponent(id)}/extract`
    );
  },

  approveAllReady: async (meetingId: string, actor: string): Promise<BulkApproveResponse> => {
    return apiClient.post<BulkApproveResponse>(
      `/meetings/${encodeURIComponent(meetingId)}/approve-all-ready`,
      { actor }
    );
  },

  previewPush: async (meetingId: string, target = 'trello'): Promise<PushResponse> => {
    return apiClient.post<PushResponse>(
      `/meetings/${encodeURIComponent(meetingId)}/push`,
      undefined,
      { target, dry_run: true }
    );
  },

  executePush: async (meetingId: string, target = 'trello'): Promise<PushResponse> => {
    return apiClient.post<PushResponse>(
      `/meetings/${encodeURIComponent(meetingId)}/push`,
      undefined,
      { target, dry_run: false }
    );
  },

  exportMeeting: async (
    meetingId: string,
    format: 'csv' | 'json',
    only: 'approved' | 'all',
    filename: string
  ): Promise<void> => {
    return apiClient.downloadFile(
      `/meetings/${encodeURIComponent(meetingId)}/export`,
      { format, only },
      filename
    );
  },
};
