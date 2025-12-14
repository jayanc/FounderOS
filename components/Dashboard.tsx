
import React, { useState, useEffect } from 'react';
import { Briefing, ReceiptData, ActionItem, User, ViewState, AppSettings } from '../types';
import { generateDailyBriefing } from '../services/geminiService';
import { Sparkles, ArrowUpRight, TrendingUp, AlertTriangle, Loader2, Calculator, Receipt, PieChart as PieIcon, Activity, CalendarDays, Wallet, Clock, FileText, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ProcessingStatus } from './ProcessingStatus';

interface DashboardProps {
  receipts: ReceiptData[];
  tasks: ActionItem[];
  user: User | null;
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const Dashboard: React.FC<DashboardProps> = ({ receipts, tasks, user, onNavigate, settings }) => {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [vatInput, setVatInput] = useState<number | ''>('');
  const [vatResult, setVatResult] = useState<{vat: number, total: number} | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const text = await generateDailyBriefing(receipts, tasks);
      setBriefing(text);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getRate = (code: string) => settings.exchangeRates[code] || 1;

  const totalSpent = receipts.reduce((acc, r) => {
      // Normalize to Reporting Currency
      const rate = getRate(r.currency);
      return acc + (r.amount * rate);
  }, 0);

  const highPriorityTasks = tasks.filter(t => t.priority === 'High').length;
  const receiptCount = receipts.length;

  const categoryData = receipts.reduce((acc: any[], r) => {
      const existing = acc.find(c => c.name === r.category);
      const rate = getRate(r.currency);
      const val = r.amount * rate;
      
      if (existing) {
          existing.value += val;
      } else {
          acc.push({ name: r.category, value: val });
      }
      return acc;
  }, []);

  const calculateVat = (amount: number) => {
      const vat = amount * 0.25;
      setVatResult({ vat, total: amount + vat });
  };

  const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in duration-700">
      
      <ProcessingStatus isProcessing={loading} taskName="Generating Executive Briefing" mode="CLOUD" />

      {/* Hero Section */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 pb-2">
        <div>
            <div className="flex items-center gap-2 mb-2">
                 <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Activity className="w-3 h-3" /> System Operational
                 </span>
                 <span className="text-[10px] text-zinc-500 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                     {settings.country} • {settings.currency}
                 </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                Good Morning, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">{user?.name.split(' ')[0] || 'Founder'}</span>.
            </h1>
            <p className="text-zinc-400 mt-3 text-lg font-light max-w-2xl">
                Your business intelligence overview is ready. {highPriorityTasks > 0 ? `You have ${highPriorityTasks} urgent items requiring attention.` : "All systems are nominal."}
            </p>
        </div>
        <div className="flex gap-3">
             <button 
                onClick={generate}
                disabled={loading}
                className="group relative flex items-center gap-3 px-6 py-3 bg-zinc-100 hover:bg-white text-zinc-950 rounded-xl font-semibold transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"/>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span className="relative">{briefing ? "Refresh Intelligence" : "Generate Briefing"}</span>
            </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Burn */}
        <div 
            id="dashboard-kpi"
            onClick={() => onNavigate(ViewState.FINANCE)}
            className="relative group bg-zinc-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:bg-zinc-900/60 transition-all duration-300 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ring-1 ring-inset ring-transparent hover:ring-indigo-500/20"
        >
            <div className="absolute top-0 right-0 p-6 opacity-50 group-hover:opacity-100 transition-opacity">
                 <ArrowUpRight className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400" />
            </div>
            <div className="flex flex-col h-full justify-between gap-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500/20 to-orange-500/20 flex items-center justify-center border border-rose-500/10">
                    <Wallet className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1">Total Spend <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"/></p>
                    <p className="text-3xl font-bold text-white mt-1 tabular-nums tracking-tight">{totalSpent.toLocaleString(undefined, {minimumFractionDigits: 2})} <span className="text-sm text-zinc-500">{settings.currency}</span></p>
                </div>
            </div>
        </div>

        {/* Action Items */}
        <div 
            onClick={() => onNavigate(ViewState.OPS)}
            className="relative group bg-zinc-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:bg-zinc-900/60 transition-all duration-300 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ring-1 ring-inset ring-transparent hover:ring-indigo-500/20"
        >
             <div className="absolute top-0 right-0 p-6 opacity-50 group-hover:opacity-100 transition-opacity">
                 <div className={`w-2 h-2 rounded-full ${highPriorityTasks > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            </div>
            <div className="flex flex-col h-full justify-between gap-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center border border-amber-500/10">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1">Action Items <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"/></p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-3xl font-bold text-white tabular-nums tracking-tight">{tasks.length}</p>
                        {highPriorityTasks > 0 && <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">{highPriorityTasks} Urgent</span>}
                    </div>
                </div>
            </div>
        </div>

        {/* Document Store */}
        <div 
            onClick={() => onNavigate(ViewState.FINANCE)}
            className="relative group bg-zinc-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:bg-zinc-900/60 transition-all duration-300 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ring-1 ring-inset ring-transparent hover:ring-indigo-500/20"
        >
            <div className="absolute top-0 right-0 p-6 opacity-50 group-hover:opacity-100 transition-opacity">
                 <ArrowUpRight className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400" />
            </div>
            <div className="flex flex-col h-full justify-between gap-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 flex items-center justify-center border border-indigo-500/10">
                    <Receipt className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1">Documents <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"/></p>
                    <p className="text-3xl font-bold text-white mt-1 tabular-nums tracking-tight">{receiptCount}</p>
                </div>
            </div>
        </div>

        {/* Utility Card */}
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2 text-zinc-400">
                <Calculator className="w-4 h-4" /> <span className="text-xs font-bold uppercase tracking-wider">Quick VAT (25%)</span>
            </div>
            <div className="space-y-3">
                <input 
                    type="number" 
                    placeholder="Enter Net Amount..."
                    value={vatInput}
                    onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setVatInput(val || '');
                        if(val) calculateVat(val);
                        else setVatResult(null);
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-600 font-mono"
                />
                {vatResult ? (
                     <div className="flex justify-between items-center bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2 px-3">
                        <span className="text-xs text-indigo-300">VAT: {vatResult.vat.toFixed(2)}</span>
                        <span className="text-sm font-bold text-white font-mono">{vatResult.total.toFixed(2)}</span>
                    </div>
                ) : (
                    <div className="h-[38px] flex items-center justify-center text-xs text-zinc-600 italic">
                        Result will appear here
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          {/* Executive Briefing */}
          <div className="lg:col-span-2 bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden flex flex-col relative min-h-[400px]">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                          <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <h3 className="font-semibold text-white tracking-tight">Executive Briefing</h3>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">{new Date().toLocaleDateString()} • AI GENERATED</span>
              </div>
              
              {!briefing ? (
                 <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-6 p-10">
                    <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full" />
                        <Sparkles className="w-12 h-12 relative text-indigo-400 opacity-80" />
                    </div>
                    <p className="max-w-sm text-center text-sm font-light">
                        Generate a synthesized briefing of your financial status, upcoming schedule, and urgent tasks.
                    </p>
                    <button onClick={generate} disabled={loading} className="text-indigo-400 text-sm hover:text-indigo-300 underline underline-offset-4">
                        Initialize Analysis
                    </button>
                 </div>
              ) : (
                <div className="p-8 overflow-y-auto custom-scrollbar">
                    <div className="prose prose-invert max-w-none prose-p:text-zinc-300 prose-p:leading-relaxed prose-headings:font-bold prose-headings:text-white prose-strong:text-indigo-300 prose-li:text-zinc-300">
                        {briefing.split('\n').map((line, i) => {
                            if (line.startsWith('## ')) return <h2 key={i} className="text-2xl mt-6 mb-4 font-bold tracking-tight text-white border-l-4 border-indigo-500 pl-4">{line.replace('## ', '')}</h2>
                            if (line.startsWith('### ')) return <h3 key={i} className="text-lg mt-6 mb-3 font-semibold text-indigo-100 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"/>{line.replace('### ', '')}</h3>
                            if (line.startsWith('- ')) return <li key={i} className="ml-6 list-disc text-zinc-300 my-1 marker:text-zinc-600">{line.replace('- ', '')}</li>
                            if (line.match(/^\d\./)) return <div key={i} className="flex gap-3 my-3 p-3 bg-white/5 rounded-xl border border-white/5"><span className="font-bold text-indigo-400 font-mono">{line.split('.')[0]}.</span><span className="text-zinc-200">{line.split('.').slice(1).join('.')}</span></div>
                            return <p key={i} className="my-2 text-zinc-400">{line}</p>
                        })}
                    </div>
                </div>
              )}
          </div>

          {/* Analytics Column */}
          <div className="flex flex-col gap-6">
              {/* Pie Chart */}
              <div onClick={() => onNavigate(ViewState.FINANCE)} className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 flex-1 flex flex-col group cursor-pointer hover:bg-zinc-900/60 transition-colors">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-semibold text-zinc-200 flex items-center gap-2 text-sm uppercase tracking-wider">
                          <PieIcon className="w-4 h-4 text-zinc-500" /> Expense Breakdown
                      </h3>
                      <ArrowUpRight className="w-4 h-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {categoryData.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm italic border-2 border-dashed border-zinc-800 rounded-2xl">
                          No data available
                      </div>
                  ) : (
                      <div className="flex-1 min-h-[200px] relative">
                          <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                  <Pie
                                      data={categoryData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={60}
                                      outerRadius={80}
                                      paddingAngle={5}
                                      dataKey="value"
                                      stroke="none"
                                  >
                                      {categoryData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                      ))}
                                  </Pie>
                                  <Tooltip 
                                      contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                                      itemStyle={{ color: '#e4e4e7', fontSize: '12px' }}
                                      formatter={(value: any) => [`${value.toFixed(2)} ${settings.currency}`, 'Value']}
                                      cursor={false}
                                  />
                                  <Legend 
                                    verticalAlign="bottom" 
                                    height={36} 
                                    iconType="circle" 
                                    formatter={(value) => <span className="text-xs text-zinc-400 ml-1">{value}</span>}
                                  />
                              </PieChart>
                          </ResponsiveContainer>
                          {/* Center Text */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none mb-8">
                             <div className="text-center">
                                 <p className="text-xs text-zinc-500 uppercase font-bold">Total</p>
                                 <p className="text-lg font-bold text-white">{totalSpent.toFixed(0)} <span className="text-[10px]">{settings.currency}</span></p>
                             </div>
                          </div>
                      </div>
                  )}
              </div>

               {/* Quick Links for Tools */}
               <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => onNavigate(ViewState.TIMESHEETS)} className="bg-zinc-900/40 hover:bg-zinc-800/80 p-4 rounded-2xl border border-white/5 flex flex-col items-center gap-2 transition-all">
                      <Clock className="w-6 h-6 text-indigo-400" />
                      <span className="text-xs font-medium text-zinc-300">Timesheets</span>
                  </button>
                  <button onClick={() => onNavigate(ViewState.CONTRACTS)} className="bg-zinc-900/40 hover:bg-zinc-800/80 p-4 rounded-2xl border border-white/5 flex flex-col items-center gap-2 transition-all">
                      <FileText className="w-6 h-6 text-emerald-400" />
                      <span className="text-xs font-medium text-zinc-300">Contracts</span>
                  </button>
               </div>
          </div>
      </div>
    </div>
  );
};
