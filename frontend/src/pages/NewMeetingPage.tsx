import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Sparkles, 
  Calendar, 
  Users, 
  FileText, 
  Plus, 
  X, 
  AlertCircle,
  FileUp,
  FileCode
} from 'lucide-react';
import { meetingsApi } from '../api/meetings';
import { useToast } from '../components/common/Toast';

const SAMPLE_DEMO_TRANSCRIPT = `Alice: Good morning team. Let's align on the Q3 roadmap and sprint deliverables.
Bob: Hi Alice. I will set up the automated CI/CD pipeline by November 1st.
Alice: Great, Bob. Make sure to include automated linting and unit test checks.
Carol: I propose we switch the database to PostgreSQL, but we need to discuss with DevOps first.
Bob: What about the frontend redesign? Who is owning the new dashboard?
Alice: Tanishq or Harsh should take the lead on the frontend UI components by end of this week.
Carol: Are we migrating the old user accounts before launch? We haven't decided that yet.
Alice: That remains an open question for next Tuesday's architectural sync.
Bob: I will also follow up with Trello integration credentials with Harsh tomorrow.`;

export const NewMeetingPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError, warning } = useToast();

  const todayStr = new Date().toISOString().split('T')[0];

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr);
  const [participantInput, setParticipantInput] = useState('');
  const [participants, setParticipants] = useState<string[]>(['Alice', 'Bob', 'Carol']);
  const [rawText, setRawText] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdMeetingId, setCreatedMeetingId] = useState<string | null>(null);

  const handleAddParticipant = () => {
    const trimmed = participantInput.trim();
    if (trimmed && !participants.includes(trimmed)) {
      setParticipants([...participants, trimmed]);
      setParticipantInput('');
    }
  };

  const handleRemoveParticipant = (name: string) => {
    setParticipants(participants.filter((p) => p !== name));
  };

  const handleKeyDownParticipant = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddParticipant();
    }
  };

  const handleLoadSample = () => {
    setTitle('Q3 Roadmap Planning & Sprint Sync');
    setDate(todayStr);
    setParticipants(['Alice', 'Bob', 'Carol', 'Harsh', 'Tanishq']);
    setRawText(SAMPLE_DEMO_TRANSCRIPT);
    success('Loaded demo sample transcript');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      warning('Only .txt and .md text files are supported for browser paste convenience.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        if (!title) {
          setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
        }
        success(`Loaded text file: ${file.name}`);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setErrorMessage('Please provide a meeting title.');
      return;
    }
    if (!date) {
      setErrorMessage('Please select a valid meeting date.');
      return;
    }
    if (!rawText.trim()) {
      setErrorMessage('Please provide a transcript or meeting notes.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // Step 1: Create Meeting
      const meeting = await meetingsApi.createMeeting({
        title: title.trim(),
        date,
        participants,
        raw_text: rawText.trim(),
      });

      setCreatedMeetingId(meeting.id);

      // Step 2: Trigger Extraction
      try {
        await meetingsApi.triggerExtraction(meeting.id);
        success('Meeting created & AI extraction initiated');
        navigate(`/meetings/${meeting.id}`);
      } catch (extractErr: any) {
        // Create succeeded but extraction failed to trigger
        setErrorMessage(
          `Meeting was created successfully, but extraction failed to start: ${extractErr.message}. You can open the meeting and retry extraction.`
        );
        showError('Extraction trigger failed');
      }
    } catch (createErr: any) {
      setErrorMessage(createErr.message || 'Failed to create meeting.');
      showError(createErr.message || 'Failed to create meeting.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Meetings</span>
        </Link>

        <button
          type="button"
          onClick={handleLoadSample}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors shadow-2xs"
          title="Pre-populate with sample hackathon transcript"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Load Demo Sample</span>
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Submit Meeting Transcript
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Provide the meeting dialogue or notes. The agent will extract action items, owners, deadlines, and flag any ambiguity.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <div>
              <p className="font-semibold">Submission Notice</p>
              <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
              {createdMeetingId && (
                <div className="mt-2">
                  <Link
                    to={`/meetings/${createdMeetingId}`}
                    className="font-bold underline text-rose-900"
                  >
                    Open Created Meeting Workspace →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Meeting Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 Roadmap Planning"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          {/* Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Meeting Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            {/* File Upload Shortcut */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Load from File (.txt, .md)
              </label>
              <label className="w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 text-slate-600 cursor-pointer transition-colors h-[42px]">
                <FileUp className="w-4 h-4 text-slate-400" />
                <span>Choose text file</span>
                <input
                  type="file"
                  accept=".txt,.md"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Participants */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Participants (Tags)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={participantInput}
                onChange={(e) => setParticipantInput(e.target.value)}
                onKeyDown={handleKeyDownParticipant}
                placeholder="Type name and press Enter (e.g. Alice, Bob)..."
                className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddParticipant}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                Add
              </button>
            </div>

            {participants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                {participants.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 shadow-2xs"
                  >
                    <span>{name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveParticipant(name)}
                      className="text-slate-400 hover:text-rose-600"
                      aria-label={`Remove ${name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Transcript / Raw Text */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Transcript / Notes <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                {rawText.length} characters
              </span>
            </div>
            <textarea
              rows={10}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste dialogue transcript here, for example:&#10;Alice: We need to finalize the CI pipeline by Friday.&#10;Bob: I will handle that."
              className="w-full px-3.5 py-3 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed"
              required
            />
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <Link
              to="/"
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm shadow-md shadow-indigo-100 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Submitting & Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analyze Meeting with AI</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
