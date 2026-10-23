import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Users, 
  UserPlus, 
  Mail, 
  Edit3, 
  Trash2, 
  RefreshCw, 
  Trello, 
  Github, 
  CheckCircle2, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { membersApi } from '../api/members';
import { Member } from '../types/api';
import { MemberFormModal } from '../components/members/MemberFormModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { useToast } from '../components/common/Toast';

export const MembersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: members = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['members'],
    queryFn: () => membersApi.listMembers(),
  });

  const handleOpenCreate = () => {
    setEditingMember(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (member: Member) => {
    setEditingMember(member);
    setIsModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingMember) return;
    try {
      setIsDeleting(true);
      await membersApi.deleteMember(deletingMember.id);
      success(`Removed ${deletingMember.name}`);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setDeletingMember(null);
    } catch (err: any) {
      showError(err.message || 'Failed to delete team member.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team Members</h1>
          <p className="text-sm text-slate-500 mt-1">
            Map speaker names and emails to Trello member IDs and GitHub logins for automatic assignment.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
            title="Refresh team members"
            aria-label="Refresh team members"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm shadow-sm shadow-indigo-100 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2.5">
        <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <span>
          Member profiles store public integration handles only. No API keys or tokens are ever requested or stored on the client.
        </span>
      </div>

      {/* Members Table / Grid */}
      {isLoading ? (
        <LoadingState message="Loading team members..." fullPage />
      ) : isError ? (
        <ErrorState
          error={error as any}
          title="Could not load team members"
          onRetry={() => refetch()}
        />
      ) : members.length === 0 ? (
        <EmptyState
          title="No team members added yet"
          description="Register team members to enable accurate owner resolution and automated task assignment on Trello."
          icon={Users}
          action={{
            label: 'Add First Member',
            onClick: handleOpenCreate,
            icon: UserPlus,
          }}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-5">Member Name</th>
                  <th className="py-3 px-5">Email Address</th>
                  <th className="py-3 px-5">Trello Mapping</th>
                  <th className="py-3 px-5">GitHub Handle</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Name */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs flex-shrink-0">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 block">{member.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">ID: {member.id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{member.email}</span>
                      </div>
                    </td>

                    {/* Trello Member ID */}
                    <td className="py-4 px-5">
                      {member.trello_member_id ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-mono text-[11px]">
                          <Trello className="w-3 h-3 text-blue-600" />
                          <span>{member.trello_member_id}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not configured</span>
                      )}
                    </td>

                    {/* GitHub Login */}
                    <td className="py-4 px-5">
                      {member.github_login ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-mono text-[11px]">
                          <Github className="w-3 h-3 text-slate-700" />
                          <span>@{member.github_login}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not configured</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(member)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                          title="Edit member"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingMember(member)}
                          className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          title="Delete member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Form Modal */}
      <MemberFormModal
        isOpen={isModalOpen}
        member={editingMember}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['members'] })}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingMember)}
        title="Remove Team Member"
        message={
          <>
            Are you sure you want to remove <strong className="font-semibold text-slate-900">{deletingMember?.name}</strong>?
            Future automated task mappings for this member will need to be reconfigured.
          </>
        }
        confirmLabel="Remove Member"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingMember(null)}
      />
    </div>
  );
};
