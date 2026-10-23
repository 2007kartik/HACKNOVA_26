/**
 * Team Members API Endpoints
 * Adheres strictly to ANTIGRAVITY_FRONTEND_IMPLEMENTATION_BRIEF.md
 */

import { apiClient } from './client';
import { Member } from '../types/api';

export interface CreateMemberPayload {
  name: string;
  email: string;
  trello_member_id?: string | null;
  github_login?: string | null;
}

export interface UpdateMemberPayload {
  name: string;
  email: string;
  trello_member_id?: string | null;
  github_login?: string | null;
}

export const membersApi = {
  listMembers: async (): Promise<Member[]> => {
    const data = await apiClient.get<Member[]>('/members');
    return Array.isArray(data) ? data : [];
  },

  createMember: async (payload: CreateMemberPayload): Promise<Member> => {
    return apiClient.post<Member>('/members', payload);
  },

  updateMember: async (id: string, payload: UpdateMemberPayload): Promise<Member> => {
    return apiClient.put<Member>(`/members/${encodeURIComponent(id)}`, payload);
  },

  deleteMember: async (id: string): Promise<void> => {
    return apiClient.delete<void>(`/members/${encodeURIComponent(id)}`);
  },
};
