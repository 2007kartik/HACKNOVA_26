import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, ArrowRight, ShieldCheck, Zap, Brain, GitBranch,
  Bell, BarChart3, FileDown, AlertTriangle, CheckCircle2,
  Moon, Sun, ChevronRight, Play, ExternalLink,
} from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';

// ── Scroll reveal hook ────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) el.classList.add('visible'); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

// ── Typing effect hook ────────────────────────────────────────────────────────
const TYPING_WORDS = ['execution', 'action', 'results', 'clarity'];

function useTypingEffect() {
  const [wordIdx, setWordIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [phase, setPhase] = useState<'typing' | 'pause' | 'deleting'>('typing');

  useEffect(() => {
    const word = TYPING_WORDS[wordIdx];
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === 'typing') {
      if (displayed.length < word.length) {
        timeout = setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 80);
      } else {
        timeout = setTimeout(() => setPhase('pause'), 1800);
      }
    } else if (phase === 'pause') {
      timeout = setTimeout(() => setPhase('deleting'), 400);
    } else {
      if (displayed.length > 0) {
        timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 45);
      } else {
        setWordIdx((i) => (i + 1) % TYPING_WORDS.length);
        setPhase('typing');
      }
    }
    return () => clearTimeout(timeout);
  }, [displayed, phase, wordIdx]);

  return displayed;
}

// ── Particle canvas ───────────────────────────────────────────────────────────
const ParticleField: React.FC<{ dark: boolean }> = ({ dark }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      r: number; alpha: number; color: string;
    }> = [];

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#a78bfa'];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.6 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(p.alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
      });

      // Draw connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(99,102,241,${0.12 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [dark]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: dark ? 0.7 : 0.4 }}
    />
  );
};

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Brain, color: 'text-indigo-400', border: 'border-indigo-500/30', glow: 'hover:shadow-indigo-500/20',
    title: 'AI Extraction', tag: 'Two-Pass AI',
    desc: 'Two-pass pipeline extracts action items, decisions, follow-ups with owner, deadline, and confidence score.',
  },
  {
    icon: ShieldCheck, color: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'hover:shadow-emerald-500/20',
    title: 'Approval Gate', tag: 'Unbreakable',
    desc: 'State machine enforced at 3 layers. Nothing reaches Trello or GitHub without your explicit approval.',
  },
  {
    icon: AlertTriangle, color: 'text-amber-400', border: 'border-amber-500/30', glow: 'hover:shadow-amber-500/20',
    title: 'Ambiguity Detection', tag: 'Smart Flags',
    desc: 'Vague owners ("the team") and missing deadlines locked until you clarify. Items can\'t slip through.',
  },
  {
    icon: GitBranch, color: 'text-violet-400', border: 'border-violet-500/30', glow: 'hover:shadow-violet-500/20',
    title: 'Duplicate Detection', tag: 'AI Pass 2',
    desc: 'Second AI pass finds conflicts and duplicates across all items. Merge, keep both, or reject one.',
  },
  {
    icon: Zap, color: 'text-blue-400', border: 'border-blue-500/30', glow: 'hover:shadow-blue-500/20',
    title: 'Trello & GitHub', tag: 'One Click',
    desc: 'Dry-run preview shows exactly what will be created. Real push creates cards and issues instantly.',
  },
  {
    icon: Bell, color: 'text-rose-400', border: 'border-rose-500/30', glow: 'hover:shadow-rose-500/20',
    title: 'Slack Reminders', tag: 'Auto',
    desc: 'Scheduler sends overdue reminders every 5 minutes — only for approved items, never unapproved.',
  },
  {
    icon: BarChart3, color: 'text-cyan-400', border: 'border-cyan-500/30', glow: 'hover:shadow-cyan-500/20',
    title: 'Live Dashboard', tag: 'Real-time',
    desc: 'Overdue items, unassigned tasks, status counts, and pending work from previous meetings.',
  },
  {
    icon: FileDown, color: 'text-teal-400', border: 'border-teal-500/30', glow: 'hover:shadow-teal-500/20',
    title: 'CSV & JSON Export', tag: 'Any Tool',
    desc: 'Export approved tasks for Jira, Notion, spreadsheets, or any custom pipeline you need.',
  },
];

const FLOW = [
  { n: '01', label: 'Paste transcript',    desc: 'Upload or paste your raw meeting notes or recording.' },
  { n: '02', label: 'AI extracts items',   desc: 'Our AI identifies every commitment, decision, follow-up.' },
  { n: '03', label: 'Clarify ambiguities', desc: 'Fill in missing owners and deadlines before review.' },
  { n: '04', label: 'Approve or reject',   desc: 'One-click approval per item or bulk-approve all ready.' },
  { n: '05', label: 'Push to integrations',desc: 'Trello cards, GitHub issues — created in seconds.' },
  { n: '06', label: 'Track & get reminded',desc: 'Dashboard + Slack keep overdue work visible.' },
];

const STATS = [
  { value: '5+',   label: 'Item types' },
  { value: '3',    label: 'Integrations' },
  { value: '139',  label: 'Tests passing' },
  { value: '100%', label: 'Gate enforced' },
];

const INTEGRATIONS = [
  { name: 'Trello',    color: 'from-blue-500 to-blue-600',    desc: 'Cards in To Do list' },
  { name: 'GitHub',    color: 'from-slate-700 to-slate-900',  desc: 'Issues with labels' },
  { name: 'Slack',     color: 'from-green-500 to-green-600',  desc: 'Overdue reminders' },
  { name: 'CSV/JSON',  color: 'from-teal-500 to-teal-600',    desc: 'Export anywhere' },
];

// ── Dark mode toggle button ───────────────────────────────────────────────────

const DarkToggle: React.FC<{ dark: boolean; toggle: () => void }> = ({ dark, toggle }) => (
  <button
    onClick={toggle}
    className={`relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
      dark ? 'bg-indigo-600' : 'bg-slate-200'
    }`}
    aria-label="Toggle dark mode"
  >
    <span
      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-transform duration-300 shadow-sm ${
        dark ? 'translate-x-6 bg-white' : 'translate-x-0 bg-white'
      }`}
    >
      {dark
        ? <Moon className="w-3 h-3 text-indigo-600" />
        : <Sun className="w-3 h-3 text-amber-500" />}
    </span>
  </button>
);

// ── Animated counter ─────────────────────────────────────────────────────────

const Counter: React.FC<{ value: string }> = ({ value }) => {
  const [display, setDisplay] = useState('0');
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      const num = parseInt(value.replace(/\D/g, ''));
      if (isNaN(num)) { setDisplay(value); return; }
      let start = 0;
      const step = Math.ceil(num / 40);
      const timer = setInterval(() => {
        start += step;
        if (start >= num) { setDisplay(value); clearInterval(timer); }
        else setDisplay(start + value.replace(/\d/g, ''));
      }, 40);
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref}>{display}</span>;
};

// ── 3D Floating card ─────────────────────────────────────────────────────────

const FloatingCard: React.FC<{ children: React.ReactNode; delay?: string; className?: string; style?: React.CSSProperties }> = ({
  children, delay = '0ms', className = '', style,
}) => {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.MouseEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width - 0.5;
    const cy = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: cy * -10, y: cx * 10 });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{
        transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: tilt.x === 0 ? 'transform 0.5s ease' : 'transform 0.1s ease',
        animationDelay: delay,
        ...style,
      }}
      className={className}
    >
      {children}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { dark, toggle } = useDarkMode();
  const typingWord = useTypingEffect();

  const heroRef     = useReveal();
  const statsRef    = useReveal();
  const flowRef     = useReveal();
  const featRef     = useReveal();
  const gateRef     = useReveal();
  const integRef    = useReveal();
  const ctaRef      = useReveal();

  return (
    <div className={`min-h-screen overflow-x-hidden transition-colors duration-300 ${
      dark ? 'bg-[#020617] text-slate-100' : 'bg-white text-slate-900'
    }`}>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        dark
          ? 'bg-slate-950/80 border-b border-slate-800/60'
          : 'bg-white/80 border-b border-slate-100'
      } backdrop-blur-xl`}>
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold tracking-tight">MeetingFlow</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
              dark
                ? 'bg-indigo-950 text-indigo-400 border-indigo-800'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}>AI</span>
          </div>

          {/* Nav right */}
          <div className="flex items-center gap-4">
            <DarkToggle dark={dark} toggle={toggle} />
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noopener noreferrer"
              className={`hidden sm:flex items-center gap-1 text-sm font-medium transition-colors ${
                dark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              API Docs <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={() => navigate('/meetings')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105"
            >
              Open App <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className={`relative pt-28 pb-32 px-6 overflow-hidden min-h-[92vh] flex flex-col justify-center ${
        dark ? 'bg-[#020617]' : 'bg-gradient-to-b from-slate-50 to-white'
      }`}>
        {/* Particle field */}
        <ParticleField dark={dark} />

        {/* Background grid */}
        <div className={`absolute inset-0 grid-pattern ${dark ? 'opacity-25' : 'opacity-30'}`} />

        {/* Large glow rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-indigo-500/10 animate-spin-slow pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-violet-500/10 animate-spin-slow pointer-events-none" style={{ animationDirection: 'reverse', animationDuration: '25s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-cyan-500/10 animate-spin-slow pointer-events-none" />

        {/* Orbs */}
        <div className="orb w-[500px] h-[500px] bg-indigo-600/25 -top-32 -left-32 animate-float" />
        <div className="orb w-96 h-96 bg-violet-600/20 top-10 -right-20 animate-float-slow" />
        <div className="orb w-72 h-72 bg-cyan-500/15 bottom-10 left-1/4 animate-float-slower" />
        <div className="orb w-48 h-48 bg-rose-500/10 bottom-20 right-1/4 animate-float" />

        {/* Laser beams */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/3 w-px h-full bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent animate-pulse-slow" />
          <div className="absolute top-0 left-2/3 w-px h-full bg-gradient-to-b from-transparent via-violet-500/15 to-transparent animate-pulse-slow" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent animate-pulse-slow" style={{ animationDelay: '2s' }} />
        </div>

        <div ref={heroRef} className="reveal relative max-w-5xl mx-auto text-center z-10">

          {/* Badge */}
          <div className={`inline-flex items-center gap-2.5 px-5 py-2 rounded-full text-xs font-semibold mb-10 animate-fade-up ${
            dark
              ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-700/50 shadow-lg shadow-indigo-500/20'
              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
          }`}>
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            Powered by Advanced AI · Live in seconds
          </div>

          {/* Headline with typing effect */}
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[1.05] mb-8 animate-fade-up delay-100">
            <span className={dark ? 'text-white' : 'text-slate-900'}>
              Turn meetings into
            </span>
            <br />
            {/* Typing word with cursor and glow */}
            <span className="relative inline-block">
              <span
                className="gradient-text text-glow"
                style={{
                  textShadow: dark
                    ? '0 0 60px rgba(99,102,241,0.8), 0 0 120px rgba(139,92,246,0.4)'
                    : '0 0 40px rgba(99,102,241,0.4)',
                }}
              >
                {typingWord}
              </span>
              {/* Blinking cursor */}
              <span
                className="inline-block w-1 ml-1 rounded-full bg-indigo-400 animate-pulse"
                style={{ height: '0.85em', verticalAlign: 'baseline', marginBottom: '-0.05em' }}
              />
            </span>
          </h1>

          <p className={`text-lg sm:text-xl max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-up delay-200 ${
            dark ? 'text-slate-400' : 'text-slate-500'
          }`}>
            AI extracts every action item, decision, and follow-up from your transcript.
            You review and approve. Only approved work reaches Trello or GitHub.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 animate-fade-up delay-300">
            <button
              onClick={() => navigate('/meetings')}
              className="group relative inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl font-bold text-base text-white transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #6366f1 100%)',
                backgroundSize: '200% auto',
                animation: 'gradientShift 3s ease infinite',
                boxShadow: '0 0 30px rgba(99,102,241,0.5), 0 0 60px rgba(99,102,241,0.25), 0 20px 40px rgba(99,102,241,0.3)',
              }}
            >
              {/* Shimmer overlay */}
              <span className="absolute inset-0 shimmer opacity-30" />
              <Sparkles className="w-5 h-5 relative z-10" />
              <span className="relative z-10">Get Started Free</span>
              <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-base transition-all hover:scale-105 border ${
                dark
                  ? 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-indigo-500/50 hover:text-white hover:shadow-lg hover:shadow-indigo-500/10'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50'
              }`}
            >
              <Play className="w-4 h-4" />
              View Live Demo
            </a>
          </div>

          {/* Floating preview cards */}
          <div className="relative flex justify-center gap-5 flex-wrap animate-fade-up delay-400">
            {[
              { status: 'APPROVED', title: 'Deploy API gateway', owner: 'James', deadline: 'Nov 7', conf: 97, color: 'emerald' },
              { status: 'NEEDS CLARIFICATION', title: 'Update onboarding flow', owner: '—', deadline: '—', conf: 78, color: 'amber' },
              { status: 'READY FOR REVIEW', title: 'CSV export confirmed for Q3', owner: '—', deadline: '—', conf: 99, color: 'blue' },
            ].map((card, i) => (
              <FloatingCard
                key={card.title}
                delay={`${i * 200}ms`}
                className={`w-64 p-4 rounded-2xl text-left ${
                  dark
                    ? 'bg-slate-900/90 border border-slate-700/60 shadow-2xl'
                    : 'bg-white shadow-2xl shadow-slate-200 border border-slate-100'
                }`}
                style={{
                  boxShadow: dark
                    ? `0 0 30px ${card.color === 'emerald' ? 'rgba(16,185,129,0.15)' : card.color === 'amber' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)'}, 0 20px 40px rgba(0,0,0,0.4)`
                    : undefined,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    card.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' :
                    card.color === 'amber'   ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20' :
                                               'bg-blue-500/20 text-blue-400 border border-blue-500/20'
                  }`}>{card.status}</span>
                  <span className={`text-[10px] font-bold ${
                    card.color === 'emerald' ? 'text-emerald-400' :
                    card.color === 'amber'   ? 'text-amber-400' : 'text-blue-400'
                  }`}>{card.conf}%</span>
                </div>
                <p className={`text-xs font-semibold mb-3 line-clamp-2 ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
                  {card.title}
                </p>
                <div className={`flex items-center justify-between text-[10px] mb-2 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <span>{card.owner}</span>
                  <span>{card.deadline}</span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <div
                    className={`h-full rounded-full ${
                      card.color === 'emerald' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
                      card.color === 'amber'   ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                                                 'bg-gradient-to-r from-blue-500 to-blue-400'
                    }`}
                    style={{ width: `${card.conf}%`, boxShadow: `0 0 8px ${card.color === 'emerald' ? '#10b981' : card.color === 'amber' ? '#f59e0b' : '#3b82f6'}` }}
                  />
                </div>
              </FloatingCard>
            ))}
          </div>

          {/* Trusted by line */}
          <div className={`mt-14 flex items-center justify-center gap-2 text-xs animate-fade-up delay-500 ${dark ? 'text-slate-600' : 'text-slate-400'}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            139 tests passing
            <span className="mx-2 opacity-30">·</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Trello + GitHub + Slack
            <span className="mx-2 opacity-30">·</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Built for HackNova '26
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <section className={`py-14 border-y ${
        dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50'
      }`}>
        <div ref={statsRef} className="reveal max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-4xl font-black gradient-text mb-1">
                <Counter value={s.value} />
              </div>
              <div className={`text-xs font-medium ${dark ? 'text-slate-500' : 'text-slate-500'}`}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className={`py-24 px-6 ${dark ? 'bg-[#020617]' : 'bg-white'}`}>
        <div ref={flowRef} className="reveal max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className={`text-4xl font-bold mb-4 ${dark ? 'text-white' : 'text-slate-900'}`}>
              Six steps to{' '}
              <span className="gradient-text">zero missed commitments</span>
            </h2>
            <p className={`text-base max-w-xl mx-auto ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
              From raw transcript to Trello card — with a human in the loop.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FLOW.map((step, i) => (
              <div
                key={step.n}
                className={`relative p-6 rounded-2xl border transition-all hover:scale-[1.02] cursor-default group ${
                  dark
                    ? 'border-slate-800 bg-slate-900/60 hover:border-indigo-500/50 hover:bg-slate-900'
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-50'
                }`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="text-5xl font-black text-indigo-500/15 group-hover:text-indigo-500/25 transition-colors mb-3 leading-none select-none">
                  {step.n}
                </div>
                <h3 className={`font-bold mb-1.5 ${dark ? 'text-white' : 'text-slate-900'}`}>{step.label}</h3>
                <p className={`text-sm leading-relaxed ${dark ? 'text-slate-500' : 'text-slate-500'}`}>{step.desc}</p>
                <ChevronRight className="absolute bottom-5 right-5 w-4 h-4 text-indigo-500/40 group-hover:text-indigo-500/70 transition-colors" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section className={`py-24 px-6 ${dark ? 'bg-slate-950/60' : 'bg-slate-50'}`}>
        <div ref={featRef} className="reveal max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className={`text-4xl font-bold mb-4 ${dark ? 'text-white' : 'text-slate-900'}`}>
              Everything your team needs
            </h2>
            <p className={`text-base max-w-xl mx-auto ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
              Built so meeting commitments actually get executed.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <FloatingCard
                  key={f.title}
                  delay={`${i * 80}ms`}
                  className={`p-5 rounded-2xl border transition-all cursor-default hover:shadow-xl ${f.glow} ${
                    dark
                      ? `border-slate-800 bg-slate-900/80 hover:border-slate-700 ${f.border.replace('border-', 'hover:border-')}`
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      dark ? 'bg-slate-800' : 'bg-slate-100'
                    }`}>
                      <Icon className={`w-5 h-5 ${f.color}`} />
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                      dark ? 'border-slate-700 text-slate-500 bg-slate-800/50' : 'border-slate-200 text-slate-400 bg-slate-50'
                    }`}>{f.tag}</span>
                  </div>
                  <h3 className={`font-bold text-sm mb-2 ${dark ? 'text-white' : 'text-slate-900'}`}>{f.title}</h3>
                  <p className={`text-xs leading-relaxed ${dark ? 'text-slate-500' : 'text-slate-500'}`}>{f.desc}</p>
                </FloatingCard>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── The Gate (hero banner) ──────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div ref={gateRef} className="reveal max-w-4xl mx-auto">
          <div className="relative rounded-3xl overflow-hidden gradient-bg p-px">
            <div className={`relative rounded-3xl p-10 text-center ${
              dark ? 'bg-slate-950/90' : 'bg-slate-900/95'
            }`}>
              {/* Grid overlay */}
              <div className="absolute inset-0 grid-pattern opacity-20 rounded-3xl" />

              {/* Orbs inside banner */}
              <div className="orb w-48 h-48 bg-indigo-600/40 -top-10 -left-10" />
              <div className="orb w-48 h-48 bg-violet-600/30 -bottom-10 -right-10" />

              <div className="relative">
                <div className="inline-flex items-center gap-2 glass px-4 py-1.5 rounded-full text-xs font-semibold text-indigo-300 mb-6">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  The Approval Gate — Our Key Innovation
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                  Nothing gets pushed without your sign-off
                </h2>
                <p className="text-slate-400 text-base max-w-2xl mx-auto mb-10 leading-relaxed">
                  Our state machine enforces the gate at three independent layers simultaneously.
                  Not just a UI check — physically impossible to bypass at the code level.
                </p>

                {/* State flow */}
                <div className="flex flex-wrap justify-center items-center gap-2 mb-8">
                  {['EXTRACTED', 'NEEDS CLARIFICATION', 'READY FOR REVIEW', 'APPROVED', 'SYNCED', 'DONE'].map(
                    (s, i, arr) => (
                      <React.Fragment key={s}>
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          s === 'APPROVED'
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/40 scale-110'
                            : s === 'DONE'
                            ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                            : 'glass text-slate-300'
                        }`}>{s}</span>
                        {i < arr.length - 1 && (
                          <ArrowRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                        )}
                      </React.Fragment>
                    )
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                  {[
                    { icon: '🔒', title: 'State Machine', desc: 'Every status change goes through one function — transition(). No bypassing allowed.' },
                    { icon: '🚫', title: 'Notifier Gate', desc: 'Slack notifier raises GateError for any non-APPROVED item. Enforced independently.' },
                    { icon: '✅', title: 'Push Gate', desc: 'Push endpoint queries DB for status=APPROVED only. Other items are invisible to it.' },
                  ].map((g) => (
                    <div key={g.title} className="glass p-4 rounded-xl">
                      <div className="text-xl mb-2">{g.icon}</div>
                      <div className="text-sm font-bold text-white mb-1">{g.title}</div>
                      <div className="text-xs text-slate-400 leading-relaxed">{g.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Integrations ───────────────────────────────────────────────────── */}
      <section className={`py-20 px-6 ${dark ? 'bg-slate-950/60' : 'bg-slate-50'} border-t ${
        dark ? 'border-slate-800' : 'border-slate-100'
      }`}>
        <div ref={integRef} className="reveal max-w-4xl mx-auto text-center">
          <h2 className={`text-3xl font-bold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>
            Works with your stack
          </h2>
          <p className={`text-sm mb-12 ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
            Push approved tasks to the tools your team already uses.
          </p>
          <div className="flex flex-wrap justify-center gap-5">
            {INTEGRATIONS.map((int) => (
              <FloatingCard
                key={int.name}
                className={`flex items-center gap-4 px-6 py-4 rounded-2xl border transition-all hover:scale-105 ${
                  dark
                    ? 'border-slate-800 bg-slate-900 hover:border-slate-600'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm hover:shadow-md'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${int.color} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
                  {int.name[0]}
                </div>
                <div className="text-left">
                  <div className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>{int.name}</div>
                  <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{int.desc}</div>
                </div>
              </FloatingCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className={`py-28 px-6 text-center ${dark ? 'bg-[#020617]' : 'bg-white'}`}>
        <div ref={ctaRef} className="reveal max-w-2xl mx-auto">
          <div className="text-5xl mb-6">🚀</div>
          <h2 className={`text-4xl sm:text-5xl font-black mb-6 leading-tight ${dark ? 'text-white' : 'text-slate-900'}`}>
            Ready to turn meetings
            <br />
            <span className="gradient-text">into action?</span>
          </h2>
          <p className={`text-base mb-10 ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
            Paste your first transcript and see your action items in seconds.
          </p>
          <button
            onClick={() => navigate('/meetings')}
            className="group inline-flex items-center gap-3 px-10 py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-lg shadow-2xl shadow-indigo-500/40 transition-all hover:scale-105 hover:shadow-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-4"
          >
            <Sparkles className="w-5 h-5" />
            Get Started — it's free
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <div className={`flex items-center justify-center gap-6 mt-8 text-xs ${dark ? 'text-slate-600' : 'text-slate-400'}`}>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> No signup required</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 139 tests passing</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Open source</span>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className={`py-8 px-6 border-t ${
        dark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'
      }`}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className={`text-sm font-bold ${dark ? 'text-slate-300' : 'text-slate-700'}`}>MeetingFlow AI</span>
            <span className={dark ? 'text-slate-700' : 'text-slate-300'}>·</span>
            <span className={`text-xs ${dark ? 'text-slate-600' : 'text-slate-400'}`}>Built for HackNova '26</span>
          </div>
          <div className={`flex flex-wrap items-center gap-4 text-xs ${dark ? 'text-slate-600' : 'text-slate-400'}`}>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> 139 tests</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> AI-Powered</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Neon PostgreSQL</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Trello + GitHub + Slack</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
