
import React from 'react';
import { ViewState, User } from '../types';
import { LayoutDashboard, Receipt, MessageSquareMore, BrainCircuit, Settings, LogOut, Clock, FileText, Camera, TrendingUp } from 'lucide-react';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  user: User | null;
  onLogout: () => void;
  onOpenCapture: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, user, onLogout, onOpenCapture }) => {
  const navItems = [
    { id: ViewState.DASHBOARD, label: 'Briefing', icon: LayoutDashboard },
    { id: ViewState.FINANCE, label: 'Accounting', icon: Receipt },
    { id: ViewState.PLANNING, label: 'Growth Plan', icon: TrendingUp },
    { id: ViewState.OPS, label: 'Workflow', icon: MessageSquareMore },
    { id: ViewState.TIMESHEETS, label: 'Timesheets', icon: Clock },
    { id: ViewState.CONTRACTS, label: 'Contracts', icon: FileText },
  ];

  return (
    <div className="w-20 md:w-64 bg-zinc-900/80 backdrop-blur-md border-r border-white/5 flex flex-col h-full sticky top-0 z-20 shadow-2xl">
      <div className="p-6 flex items-center gap-4 mb-4">
        <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/10">
            <BrainCircuit className="text-white w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white hidden md:block">FounderOS</h1>
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group ${
                isActive 
                  ? 'bg-zinc-800 text-white shadow-lg shadow-black/20 ring-1 ring-white/10' 
                  : 'text-zinc-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
              <span className="hidden md:block font-medium text-sm">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)] hidden md:block" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 pb-2 space-y-2 pt-2 border-t border-white/5">
         <button 
            onClick={onOpenCapture}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group text-zinc-500 hover:text-white hover:bg-white/5"
            title="Capture Screenshot"
         >
             <Camera className="w-5 h-5 text-emerald-500 group-hover:text-emerald-400 transition-colors" />
             <span className="hidden md:block font-medium text-sm text-emerald-500/80 group-hover:text-emerald-400">Capture View</span>
         </button>

         <button
            onClick={() => onNavigate(ViewState.SETTINGS)}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group ${
              currentView === ViewState.SETTINGS 
                ? 'bg-zinc-800 text-white ring-1 ring-white/10' 
                : 'text-zinc-500 hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings className={`w-5 h-5 transition-colors ${currentView === ViewState.SETTINGS ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
            <span className="hidden md:block font-medium text-sm">Settings</span>
          </button>
      </div>

      <div className="p-4 mt-2 border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 mb-3">
           <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-inner">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
           </div>
           <div className="hidden md:block overflow-hidden">
             <p className="text-xs font-semibold text-white truncate leading-tight">{user?.name || 'User'}</p>
             <p className="text-xs text-zinc-500 truncate">{user?.email || 'No Email'}</p>
           </div>
        </div>
        <button onClick={onLogout} className="w-full flex items-center gap-2 justify-center p-2 text-xs font-medium text-zinc-500 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10">
            <LogOut className="w-3.5 h-3.5" /> <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>
    </div>
  );
};
