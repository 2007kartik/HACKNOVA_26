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
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { APP_CONFIG } from '../config/app';
import { meetingsApi } from '../api/meetings';

export const AppLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Periodic health check
  useEffect(() => {
    let mounted = true;
    const checkBackend = async () => {
      try {
        await meetingsApi.checkHealth();
        if (mounted) setBackendStatus('connected');
      } catch {
        if (mounted) setBackendStatus('disconnected');
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const navItems = [
    { to: '/', label: 'Meetings', icon: Calendar, exact: true },
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/members', label: 'Team Members', icon: Users },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 font-sans text-slate-900">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-slate-900">{APP_CONFIG.appName}</h1>
            <span className="text-[10px] text-indigo-600 font-semibold">{APP_CONFIG.badge}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NavLink
            to="/meetings/new"
            className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            aria-label="New Meeting"
          >
            <PlusCircle className="w-5 h-5" />
          </NavLink>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform md:transform-none transition-transform duration-200 ease-in-out flex flex-col ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } md:static md:w-64 md:min-h-screen md:flex-shrink-0`}
      >
        {/* Brand Area */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 tracking-tight text-base">{APP_CONFIG.appName}</span>
                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-indigo-200">
                  {APP_CONFIG.badge}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate max-w-[130px]" title={APP_CONFIG.tagline}>
                {APP_CONFIG.tagline}
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden text-slate-400 hover:text-slate-600 p-1"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Button */}
        <div className="p-4">
          <NavLink
            to="/meetings/new"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm shadow-indigo-200 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Meeting</span>
          </NavLink>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Governance / Safety Notice in UX */}
        <div className="p-3 m-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-semibold mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Human-in-the-Loop</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            AI proposes; humans review & approve. Only confirmed eligible work is synced.
          </p>
        </div>

        {/* Backend Status Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                backendStatus === 'connected'
                  ? 'bg-emerald-500'
                  : backendStatus === 'checking'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-600 font-medium">
              {backendStatus === 'connected' ? 'API Online' : backendStatus === 'checking' ? 'Checking API...' : 'API Offline'}
            </span>
          </div>
          <a
            href={`${APP_CONFIG.apiBaseUrl}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5 hover:underline"
            title="FastAPI Swagger Documentation"
          >
            <span>Docs</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-xs"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
