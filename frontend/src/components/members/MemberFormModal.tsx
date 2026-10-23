import React, { useState, useEffect } from 'react';
import { X, UserPlus, Save, AlertCircle } from 'lucide-react';
import { Member } from '../../types/api';
import { membersApi, CreateMemberPayload, UpdateMemberPayload } from '../../api/members';
import { useToast } from '../common/Toast';

interface MemberFormModalProps {
  isOpen: boolean;
  member: Member | null; // null for Create, Member object for Edit
  onClose: () => void;
  onSuccess: () => void;
}

export const MemberFormModal: React.FC<MemberFormModalProps> = ({
  isOpen,
  member,
  onClose,
  onSuccess,
}) => {
  const { success, error: showError } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [trelloId, setTrelloId] = useState('');
  const [githubLogin, setGithubLogin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setName(member.name || '');
      setEmail(member.email || '');
      setTrelloId(member.trello_member_id || '');
      setGithubLogin(member.github_login || '');
    } else {
      setName('');
      setEmail('');
      setTrelloId('');
      setGithubLogin('');
    }
    setErrorMessage(null);
  }, [member, isOpen]);

  if (!isOpen) return null;

  const isEditing = Boolean(member);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setErrorMessage('Name and email are required.');
      return;
    }

    const payload: CreateMemberPayload = {
      name: name.trim(),
      email: email.trim(),
      trello_member_id: trelloId.trim() || null,
      github_login: githubLogin.trim() || null,
    };

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      if (isEditing && member) {
        await membersApi.updateMember(member.id, payload as UpdateMemberPayload);
        success('Team member updated');
      } else {
        await membersApi.createMember(payload);
        success('Team member added');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save team member.');
      showError(err.message || 'Failed to save team member.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 id="member-modal-title" className="text-base font-semibold text-slate-900">
                {isEditing ? 'Edit Team Member' : 'Add Team Member'}
              </h3>
              <p className="text-xs text-slate-500">Configure member mappings for automated task assignment.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice Chen"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. alice@company.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Integration Identifiers (Optional)
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Trello Member ID
                </label>
                <input
                  type="text"
                  value={trelloId}
                  onChange={(e) => setTrelloId(e.target.value)}
                  placeholder="e.g. 5e89d123456789abcdef0123"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-400 mt-1">Used to assign cards directly on Trello boards.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  GitHub Username
                </label>
                <input
                  type="text"
                  value={githubLogin}
                  onChange={(e) => setGithubLogin(e.target.value)}
                  placeholder="e.g. alice-chen"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : isEditing ? 'Update Member' : 'Add Member'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
