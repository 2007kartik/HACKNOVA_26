import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, RefreshCw, Calendar, Sparkles } from 'lucide-react';
import { meetingsApi } from '../api/meetings';
import { MeetingCard } from '../components/meetings/MeetingCard';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';

export const MeetingsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const {
    data: meetings = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['meetings'],
    queryFn: () => meetingsApi.listMeetings(),
  });

  const filteredMeetings = meetings.filter((meeting) => {
    const matchesSearch =
      !searchTerm ||
      meeting.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (meeting.participants && meeting.participants.some((p) => p.toLowerCase().includes(searchTerm.toLowerCase())));
    const matchesStatus = statusFilter === 'ALL' || meeting.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Meetings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Browse processed meeting transcripts, review AI extracted commitments, and trigger task board sync.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
            title="Refresh meetings list"
            aria-label="Refresh meetings"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>

          <Link
            to="/meetings/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm shadow-indigo-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Meeting</span>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search meetings by title or participant..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="EXTRACTED">Extracted</option>
            <option value="EXTRACTING">Analyzing (In Progress)</option>
            <option value="CREATED">Created</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <LoadingState message="Fetching your meetings..." fullPage />
      ) : isError ? (
        <ErrorState
          error={error as any}
          title="Could not load meetings"
          onRetry={() => refetch()}
        />
      ) : filteredMeetings.length === 0 ? (
        meetings.length === 0 ? (
          <EmptyState
            title="No meetings yet"
            description="Upload or paste your first meeting transcript to automatically extract decisions, action items, owners, and deadlines."
            icon={Sparkles}
            action={{
              label: 'Create Your First Meeting',
              onClick: () => window.location.assign('/meetings/new'),
              icon: PlusCircle,
            }}
          />
        ) : (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs">
            <p className="font-semibold text-slate-700 text-sm">No matching meetings found</p>
            <p className="mt-1">Try adjusting your search query or status filter.</p>
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
              }}
              className="mt-3 text-indigo-600 hover:underline font-semibold"
            >
              Reset filters
            </button>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </div>
      )}
    </div>
  );
};
