
import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Auth } from './components/Auth';
import { ViewState, ReceiptData, ActionItem, CalendarEvent, IntegrationAccount, User, StorageStats } from './types';
import { storageService } from './services/storageService';
import { Loader2, HardDrive, Cpu } from 'lucide-react';
import { CaptureTool } from './components/CaptureTool';

// Lazy Load Heavy Modules to optimize initial bundle size
const FinanceModule = React.lazy(() => import('./components/FinanceModule').then(module => ({ default: module.FinanceModule })));
const OpsModule = React.lazy(() => import('./components/OpsModule').then(module => ({ default: module.OpsModule })));
const ConnectAccounts = React.lazy(() => import('./components/ConnectAccounts').then(module => ({ default: module.ConnectAccounts })));
const TimesheetModule = React.lazy(() => import('./components/TimesheetModule').then(module => ({ default: module.TimesheetModule })));
const ContractModule = React.lazy(() => import('./components/ContractModule').then(module => ({ default: module.ContractModule })));

const STORAGE_KEYS = {
    USER: 'founder_os_user',
    RECEIPTS: 'founder_os_receipts',
    TASKS: 'founder_os_tasks',
    EVENTS: 'founder_os_events',
    ACCOUNTS: 'founder_os_accounts'
};

const LoadingSpinner = () => (
    <div className="flex h-full w-full items-center justify-center text-zinc-500 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <span className="text-sm font-medium tracking-wide">INITIALIZING SYSTEM...</span>
    </div>
);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  
  // Data State
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [tasks, setTasks] = useState<ActionItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [accounts, setAccounts] = useState<IntegrationAccount[]>([]);
  
  // Performance State
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  // 1. Initial User Check
  useEffect(() => {
      const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
      if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          storageService.configure(parsedUser);
      }
  }, []);

  // 2. Load User Data
  useEffect(() => {
      if (user) {
          storageService.configure(user);
          console.log(`[App] Loading data for ${user.email} via ${user.storageProvider || 'LOCAL'} provider...`);
          
          const loadData = async () => {
              // Parallel Load
              const [r, t, e, a] = await Promise.all([
                  storageService.load<ReceiptData>(STORAGE_KEYS.RECEIPTS),
                  storageService.load<ActionItem>(STORAGE_KEYS.TASKS),
                  storageService.load<CalendarEvent>(STORAGE_KEYS.EVENTS),
                  storageService.load<IntegrationAccount>(STORAGE_KEYS.ACCOUNTS)
              ]);
              setReceipts(r);
              setTasks(t);
              setEvents(e);
              setAccounts(a);
              
              // Load Stats
              updateStats();
          };
          loadData();
      }
  }, [user]);

  // 3. Persist Data (Service handles Debouncing internally)
  useEffect(() => { if (user) storageService.save(STORAGE_KEYS.RECEIPTS, receipts); }, [receipts, user]);
  useEffect(() => { if (user) storageService.save(STORAGE_KEYS.TASKS, tasks); }, [tasks, user]);
  useEffect(() => { if (user) storageService.save(STORAGE_KEYS.EVENTS, events); }, [events, user]);
  useEffect(() => { if (user) storageService.save(STORAGE_KEYS.ACCOUNTS, accounts); }, [accounts, user]);

  // Periodic Stats Update
  useEffect(() => {
      const interval = setInterval(updateStats, 30000); // Check every 30s
      return () => clearInterval(interval);
  }, []);

  const updateStats = async () => {
      const stats = await storageService.getStats();
      setStorageStats(stats);
  };

  // Auth Handlers
  const handleLogin = (authenticatedUser: User) => {
      setUser(authenticatedUser);
      storageService.configure(authenticatedUser);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(authenticatedUser));
  };

  const handleLogout = () => {
      setUser(null);
      setReceipts([]);
      setTasks([]);
      setEvents([]);
      setAccounts([]);
      localStorage.removeItem(STORAGE_KEYS.USER);
  };

  // Global Data Reset
  const handleClearData = async () => {
      if (!user) return;
      // Clear In-Memory State
      setReceipts([]);
      setTasks([]);
      setEvents([]);
      setAccounts([]);
      
      // Clear Storage
      await storageService.clearUserCache(STORAGE_KEYS.RECEIPTS);
      await storageService.clearUserCache(STORAGE_KEYS.TASKS);
      await storageService.clearUserCache(STORAGE_KEYS.EVENTS);
      await storageService.clearUserCache(STORAGE_KEYS.ACCOUNTS);
      
      updateStats();
  };

  // Optimized Data Actions with Callback Stability (though setState is stable)
  const handleAddReceipt = (receipt: ReceiptData) => setReceipts(prev => [receipt, ...prev]);
  const handleRemoveReceipt = (id: string) => setReceipts(prev => prev.filter(r => r.id !== id));
  const handleAddTasks = (newTasks: ActionItem[]) => setTasks(prev => [...newTasks, ...prev]);
  const handleRemoveTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));
  const handleAddEvents = (newEvents: CalendarEvent[]) => setEvents(prev => [...newEvents, ...prev]);
  const handleToggleAccount = (id: string) => setAccounts(prev => prev.map(a => a.id === id ? { ...a, isConnected: !a.isConnected } : a));
  const handleAddAccount = (account: IntegrationAccount) => setAccounts(prev => [...prev, account]);

  if (!user) {
      return <Auth onLogin={handleLogin} />;
  }

  const renderView = () => {
    switch (currentView) {
      case ViewState.DASHBOARD:
        return <Dashboard receipts={receipts} tasks={tasks} user={user} onNavigate={setCurrentView} />;
      case ViewState.FINANCE:
        return <FinanceModule receipts={receipts} onAddReceipt={handleAddReceipt} onRemoveReceipt={handleRemoveReceipt} accounts={accounts} />;
      case ViewState.OPS:
        return (
          <OpsModule 
            tasks={tasks} 
            events={events} 
            onAddTasks={handleAddTasks} 
            onAddEvents={handleAddEvents} 
            onAddReceipt={handleAddReceipt}
            onRemoveTask={handleRemoveTask} 
            accounts={accounts} 
          />
        );
      case ViewState.TIMESHEETS:
        return <TimesheetModule />;
      case ViewState.CONTRACTS:
        return <ContractModule />;
      case ViewState.SETTINGS:
        return (
            <ConnectAccounts 
                accounts={accounts} 
                onToggleAccount={handleToggleAccount} 
                onAddAccount={handleAddAccount}
                receipts={receipts}
                tasks={tasks}
                events={events}
                onClearData={handleClearData}
            />
        );
      default:
        return <Dashboard receipts={receipts} tasks={tasks} user={user} onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Subtle Background Effects */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-indigo-900/10 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-900/5 rounded-full blur-[120px] pointer-events-none" />

      <Sidebar 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        user={user} 
        onLogout={handleLogout} 
        onOpenCapture={() => setIsCaptureOpen(true)}
      />
      
      <main className="flex-1 p-6 lg:p-10 h-full overflow-y-auto overflow-x-hidden relative z-10 scroll-smooth">
        <div className="max-w-[1600px] mx-auto h-full flex flex-col">
            <Suspense fallback={<LoadingSpinner />}>
                {renderView()}
            </Suspense>
        </div>

        {/* Floating Status Bar */}
        {storageStats && (
            <div className="fixed bottom-6 right-6 flex items-center gap-4 bg-black/60 backdrop-blur-md border border-white/10 p-2 pl-4 rounded-full text-[10px] text-zinc-400 shadow-2xl z-50 hover:bg-black/80 transition-colors">
                <div className="flex items-center gap-2" title="Device Performance Tier">
                    <Cpu className={`w-3.5 h-3.5 ${storageStats.tier === 'High-End' ? 'text-emerald-400' : storageStats.tier === 'Mid-Range' ? 'text-amber-400' : 'text-rose-400'}`} />
                    <span className="font-medium tracking-wide uppercase">{storageStats.tier}</span>
                </div>
                <div className="w-px h-3 bg-white/10"></div>
                <div className="flex items-center gap-3 pr-2" title="Storage Usage">
                    <div className="flex items-center gap-2">
                        <HardDrive className={`w-3.5 h-3.5 ${storageStats.percentUsed > 80 ? 'text-rose-400' : 'text-zinc-500'}`} />
                        <span className="font-mono">{(storageStats.usageBytes / 1024 / 1024).toFixed(1)}MB</span>
                    </div>
                    <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div 
                            className={`h-full rounded-full transition-all duration-500 ${storageStats.percentUsed > 90 ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                            style={{ width: `${Math.min(storageStats.percentUsed, 100)}%` }} 
                        />
                    </div>
                </div>
            </div>
        )}
      </main>

      {/* Global Capture Tool */}
      <CaptureTool currentView={currentView} isOpen={isCaptureOpen} onClose={() => setIsCaptureOpen(false)} />
    </div>
  );
};

export default App;
