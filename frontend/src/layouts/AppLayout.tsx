import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Calendar,
  LayoutDashboard,
  Users,
  PlusCircle,
  Sparkles,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
  Sun,
  Moon,
  TrendingUp,
  Zap,
  Settings,
} from 'lucide-react';
import { APP_CONFIG } from '../config/app';
import { meetingsApi } from '../api/meetings';
import { useDarkMode } from '../hooks/useDarkMode';

export const AppLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const location = useLocation();
  const { dark, toggle } = useDarkMode();

  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        await meetingsApi.checkHealth();
        if (mounted) setBackendStatus('connected');
      } catch {
        if (mounted) setBackendStatus('disconnected');
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const navItems = [
    { to: '/meetings', label: 'Meetings', icon: Calendar },
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/members', label: 'Team Members', icon: Users },
  ];

  // Dummy nav items for demo
  const dummyItems = [
    { label: 'Analytics', icon: TrendingUp, soon: true },
    { label: 'Integrations', icon: Zap, soon: true },
    { label: 'Settings', icon: Settings, soon: true },
  ];

  const bg       = dark ? 'bg-slate-950'   : 'bg-white';
  const border   = dark ? 'border-slate-800' : 'border-slate-200';
  const textMain = dark ? 'text-slate-100' : 'text-slate-900';
  const textSub  = dark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`min-h-screen flex flex-col md:flex-row ${dark ? 'bg-slate-950' : 'bg-slate-50'} font-sans transition-colors duration-300`}>

      {/* Mobile Header */}
      <header className={`md:hidden flex items-center justify-between px-4 py-3 ${bg} border-b ${border} sticky top-0 z-40 transition-colors`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className={`font-bold text-sm tracking-tight ${textMain}`}>{APP_CONFIG.appName}</h1>
            <span className="text-[10px] text-indigo-500 font-semibold">{APP_CONFIG.badge}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className={`p-1.5 rounded-lg ${dark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <NavLink to="/meetings/new" className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
            <PlusCircle className="w-5 h-5" />
          </NavLink>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className={`p-1.5 rounded-lg ${textSub}`}>
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 ${bg} border-r ${border} transform md:transform-none transition-all duration-200 flex flex-col
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        md:static md:w-64 md:min-h-screen md:flex-shrink-0`}>

        {/* Brand */}
        <div className={`p-5 border-b ${border} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`font-bold tracking-tight text-base ${textMain}`}>{APP_CONFIG.appName}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                  dark ? 'bg-indigo-950 text-indigo-400 border-indigo-800' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}>{APP_CONFIG.badge}</span>
              </div>
              <p className={`text-[11px] truncate max-w-[130px] ${textSub}`}>{APP_CONFIG.tagline}</p>
            </div>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className={`md:hidden p-1 ${textSub}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Meeting button */}
        <div className="p-4">
          <NavLink
            to="/meetings/new"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-sm shadow-indigo-500/20 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Meeting</span>
          </NavLink>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-1">
        {/* Real nav links */}
        {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? dark
                        ? 'bg-indigo-900/60 text-indigo-300 font-semibold'
                        : 'bg-indigo-50 text-indigo-700 font-semibold'
                      : dark
                        ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {/* Divider */}
          <div className={`my-2 border-t ${dark ? 'border-slate-800' : 'border-slate-100'}`} />

          {/* Dummy coming soon items */}
          {dummyItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium opacity-50 cursor-not-allowed ${
                  dark ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  dark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'
                }`}>SOON</span>
              </div>
            );
          })}
        </nav>

        {/* Dark mode toggle */}
        <div className={`mx-3 mb-2 p-3 rounded-xl ${dark ? 'bg-slate-900 border border-slate-800' : 'bg-slate-50 border border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${textSub}`}>{dark ? 'Dark Mode' : 'Light Mode'}</span>
            <button
              onClick={toggle}
              className={`relative w-10 h-5 rounded-full transition-colors ${dark ? 'bg-indigo-600' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${dark ? 'translate-x-5' : 'translate-x-0.5'} flex items-center justify-center`}>
                {dark ? <Moon className="w-2.5 h-2.5 text-indigo-600" /> : <Sun className="w-2.5 h-2.5 text-amber-500" />}
              </span>
            </button>
          </div>
        </div>

        {/* Human-in-loop notice */}
        <div className={`p-3 m-3 rounded-xl ${dark ? 'bg-slate-900 border border-slate-800' : 'bg-slate-50 border border-slate-200/80'} text-xs`}>
          <div className={`flex items-center gap-1.5 font-semibold mb-1 ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>Human-in-the-Loop</span>
          </div>
          <p className={`text-[11px] leading-relaxed ${textSub}`}>
            AI proposes; humans review & approve. Only confirmed work is synced.
          </p>
        </div>

        {/* Status footer */}
        <div className={`p-4 border-t ${border} flex items-center justify-between text-xs`}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              backendStatus === 'connected' ? 'bg-emerald-500' :
              backendStatus === 'checking'  ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'
            }`} />
            <span className={`font-medium ${textSub}`}>
              {backendStatus === 'connected' ? 'API Online' : backendStatus === 'checking' ? 'Checking...' : 'API Offline'}
            </span>
          </div>
          <a
            href={`${APP_CONFIG.apiBaseUrl}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-indigo-500 hover:text-indigo-400 font-medium flex items-center gap-0.5"
          >
            Docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main content */}
      <main className={`flex-1 flex flex-col min-w-0 overflow-y-auto ${dark ? 'bg-slate-950' : 'bg-slate-50'} transition-colors`}>
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
