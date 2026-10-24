import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, ArrowRight, CheckCircle2, Zap, ShieldCheck,
  GitBranch, Bell, BarChart3, FileDown, Users,
  Brain, ListChecks, AlertTriangle, Clock,
} from 'lucide-react';

// ── Feature data ──────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Brain,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    title: 'AI-Powered Extraction',
    description:
      'Google Gemini 2.5 Flash reads your transcript and extracts every action item, decision, suggestion, open question, and follow-up — with owner, deadline, and confidence score.',
  },
  {
    icon: ShieldCheck,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    title: 'Human Approval Gate',
    description:
      'Nothing reaches Trello or GitHub without your approval. Our state machine enforces the gate — not even a bug can bypass it.',
  },
  {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    title: 'Ambiguity Detection',
    description:
      'Vague owners ("the team should…") and missing deadlines are flagged automatically. Items are locked until you clarify them.',
  },
  {
    icon: GitBranch,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    title: 'Duplicate & Conflict Detection',
    description:
      'A second AI pass finds duplicate tasks and conflicting assignments across the full item list. Merge, keep both, or reject one.',
  },
  {
    icon: Zap,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    title: 'Trello & GitHub Push',
    description:
      'Push approved tasks to Trello cards or GitHub Issues with one click. Dry-run preview shows exactly what will be created before anything happens.',
  },
  {
    icon: Bell,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    title: 'Slack Overdue Reminders',
    description:
      'The scheduler automatically sends Slack reminders for overdue approved tasks — only for approved items, never for unapproved work.',
  },
  {
    icon: BarChart3,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
    title: 'Live Dashboard',
    description:
      'See counts by status, overdue items, unassigned tasks, and pending work from previous meetings — all in one place.',
  },
  {
    icon: FileDown,
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    title: 'CSV & JSON Export',
    description:
      'Export approved tasks as CSV or JSON for import into any tool — Jira, Notion, spreadsheets, or custom pipelines.',
  },
];

const FLOW_STEPS = [
  { step: '01', label: 'Paste transcript', desc: 'Upload or paste your meeting notes or recording transcript.' },
  { step: '02', label: 'AI extracts items', desc: 'Gemini identifies every commitment, decision, and follow-up.' },
  { step: '03', label: 'Clarify ambiguities', desc: 'Assign owners and deadlines to flagged items before review.' },
  { step: '04', label: 'Approve or reject', desc: 'One-click approval per item, or bulk-approve all ready items.' },
  { step: '05', label: 'Push to Trello / GitHub', desc: 'Approved items become cards or issues instantly.' },
  { step: '06', label: 'Track & get reminded', desc: 'Dashboard + Slack alerts keep overdue work visible.' },
];

const STATS = [
  { value: '5+', label: 'Item types extracted' },
  { value: '3', label: 'Integrations (Trello, GitHub, Slack)' },
  { value: '139', label: 'Automated tests passing' },
  { value: '100%', label: 'Gate enforcement' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 tracking-tight">MeetingFlow</span>
            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-indigo-200">
              AI
            </span>
          </div>
          <button
            onClick={() => navigate('/meetings')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors shadow-sm"
          >
            Open App
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6 text-center bg-gradient-to-b from-indigo-50/60 via-white to-white">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Powered by Google Gemini 2.5 Flash
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight mb-6">
            From meeting{' '}
            <span className="text-indigo-600">transcript</span>
            <br />
            to trackable tasks
          </h1>

          <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            MeetingFlow AI reads your meeting transcript and extracts every action item, decision,
            and follow-up. You review, clarify, and approve — only then does anything get pushed to
            Trello or GitHub.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/meetings')}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base shadow-lg shadow-indigo-200 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </button>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white text-slate-700 font-semibold text-base transition-colors hover:bg-slate-50"
            >
              View API Docs
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="py-12 border-y border-slate-100 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-extrabold text-indigo-600 mb-1">{s.value}</div>
              <div className="text-xs text-slate-500 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">How it works</h2>
            <p className="text-slate-500 text-base max-w-xl mx-auto">
              Six steps from raw transcript to Trello card — with a human gate in the middle.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FLOW_STEPS.map((step) => (
              <div
                key={step.step}
                className="relative p-6 rounded-2xl border border-slate-200 bg-white hover:shadow-md transition-shadow"
              >
                <div className="text-4xl font-black text-slate-100 mb-3 leading-none">{step.step}</div>
                <h3 className="font-semibold text-slate-900 mb-1.5">{step.label}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Everything you need</h2>
            <p className="text-slate-500 text-base max-w-xl mx-auto">
              Built for teams who want meeting outcomes to actually get done.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="p-5 rounded-2xl bg-white border border-slate-200 hover:shadow-md transition-shadow"
                >
                  <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                    <Icon className={`w-5 h-5 ${f.color}`} />
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm mb-2">{f.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── The Gate — key differentiator ── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-indigo-700 p-10 text-white text-center shadow-xl shadow-indigo-200">
            <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 text-sm font-semibold mb-6">
              <ShieldCheck className="w-4 h-4" />
              The Approval Gate
            </div>
            <h2 className="text-3xl font-bold mb-4">Nothing gets pushed without your sign-off</h2>
            <p className="text-indigo-100 text-base max-w-2xl mx-auto mb-8 leading-relaxed">
              Our state machine makes it physically impossible for an unapproved item to reach Trello,
              GitHub, or trigger a Slack notification. The gate is enforced at three independent layers —
              not just a UI check.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {['EXTRACTED', '→', 'NEEDS CLARIFICATION', '→', 'READY FOR REVIEW', '→', 'APPROVED', '→', 'SYNCED'].map(
                (s, i) => (
                  <span
                    key={i}
                    className={
                      s === '→'
                        ? 'text-indigo-300 font-bold text-lg'
                        : s === 'APPROVED'
                        ? 'bg-white text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold shadow'
                        : 'bg-white/15 px-3 py-1 rounded-lg text-xs font-semibold'
                    }
                  >
                    {s}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="py-16 px-6 bg-slate-50 border-t border-slate-100">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Integrates with your stack</h2>
          <p className="text-slate-500 text-sm mb-10">
            Push approved tasks directly to the tools your team already uses.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { name: 'Trello', color: 'bg-blue-500', label: 'Create cards in To Do list' },
              { name: 'GitHub', color: 'bg-slate-800', label: 'Create issues with labels' },
              { name: 'Slack', color: 'bg-green-600', label: 'Overdue reminders' },
              { name: 'CSV / JSON', color: 'bg-teal-600', label: 'Export to any tool' },
            ].map((int) => (
              <div
                key={int.name}
                className="flex items-center gap-3 px-5 py-3 rounded-xl bg-white border border-slate-200 shadow-sm"
              >
                <div className={`w-8 h-8 rounded-lg ${int.color} flex items-center justify-center text-white text-xs font-bold`}>
                  {int.name[0]}
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-900">{int.name}</div>
                  <div className="text-xs text-slate-500">{int.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
            Ready to turn meetings into action?
          </h2>
          <p className="text-slate-500 text-base mb-10">
            Paste your first transcript and see your action items extracted in seconds.
          </p>
          <button
            onClick={() => navigate('/meetings')}
            className="inline-flex items-center gap-2 px-10 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg shadow-lg shadow-indigo-200 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Get Started — it's free
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-6 border-t border-slate-100 bg-slate-50">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-700">MeetingFlow AI</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500">Built for HackNova '26</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>139 tests passing</span>
            <span className="text-slate-300 mx-1">·</span>
            <span>Gemini 2.5 Flash</span>
            <span className="text-slate-300 mx-1">·</span>
            <span>Neon PostgreSQL</span>
          </div>
        </div>
      </footer>

    </div>
  );
};
