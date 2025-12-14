
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ViewState, GrowthPlan, AppSettings } from '../types';
import { storageService } from '../services/storageService';
import { TrendingUp, Users, AlertTriangle, Save, RefreshCw, Briefcase, LineChart, Target, Camera, Coins, Plus, Trash2, Download, Upload, MoreHorizontal, FileJson, Layout, ChevronRight, Copy } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend, ComposedChart, Line } from 'recharts';
import { ProcessingStatus } from './ProcessingStatus';

interface PlanningModuleProps {
    onOpenCapture: () => void;
    settings: AppSettings;
}

const DEFAULT_PLAN: GrowthPlan = {
    id: 'default',
    name: 'Base Case 2024',
    currency: 'USD',
    startingCash: 500000,
    currentRevenue: 25000,
    growthRate: 10,
    monthlyBurn: 40000,
    hiringBudget: 2000,
    createdAt: new Date().toISOString()
};

export const PlanningModule: React.FC<PlanningModuleProps> = ({ onOpenCapture, settings }) => {
    // --- State ---
    const [plans, setPlans] = useState<GrowthPlan[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Active Plan Resolution ---
    const activePlan = useMemo(() => {
        return plans.find(p => p.id === activeId) || plans[0] || { ...DEFAULT_PLAN, currency: settings.currency };
    }, [plans, activeId, settings.currency]);

    // --- Data Persistence ---
    
    // Initial Load
    useEffect(() => {
        const load = async () => {
            setIsProcessing(true);
            setStatusText('Loading Scenarios...');
            const data = await storageService.load<GrowthPlan>('founder_os_plans');
            
            if (data && data.length > 0) {
                // Ensure currency consistency on load
                const validatedPlans = data.map(p => ({
                    ...p,
                    currency: p.currency || settings.currency
                }));
                setPlans(validatedPlans);
                setActiveId(validatedPlans[0].id);
            } else {
                // Init with default
                const initial = [{ ...DEFAULT_PLAN, id: crypto.randomUUID(), currency: settings.currency }];
                setPlans(initial);
                setActiveId(initial[0].id);
            }
            setIsProcessing(false);
        };
        load();
    }, []); // Only run once on mount

    // Auto-Save whenever plans change
    useEffect(() => {
        if (plans.length > 0) {
            storageService.save('founder_os_plans', plans);
        }
    }, [plans]);

    // --- Helpers ---

    const calculateProjections = (plan: GrowthPlan) => {
        const data = [];
        let cash = plan.startingCash;
        let revenue = plan.currentRevenue;
        let expenses = plan.monthlyBurn;

        for (let i = 0; i < 24; i++) { // 24 Months projection
            const month = new Date();
            month.setMonth(month.getMonth() + i);
            const monthName = month.toLocaleString('default', { month: 'short', year: '2-digit' });

            revenue = revenue * (1 + (plan.growthRate / 100));
            expenses = expenses + plan.hiringBudget; 
            const profit = revenue - expenses;
            cash = cash + profit;

            data.push({
                name: monthName,
                revenue: Math.round(revenue),
                expenses: Math.round(expenses),
                cash: Math.round(cash),
                profit: Math.round(profit)
            });
        }
        return data;
    };

    const projections = useMemo(() => calculateProjections(activePlan), [activePlan]);

    const getRunway = (proj: any[]) => {
        const negativeCashIndex = proj.findIndex(p => p.cash < 0);
        return negativeCashIndex === -1 ? '24+' : negativeCashIndex;
    };

    // --- Actions ---

    const updateActivePlan = (field: keyof GrowthPlan, value: any) => {
        setPlans(prev => prev.map(p => p.id === activePlan.id ? { ...p, [field]: value } : p));
    };

    const handleCreateScenario = () => {
        const newPlan: GrowthPlan = {
            ...activePlan, // Clone current as base
            id: crypto.randomUUID(),
            name: `${activePlan.name} (Copy)`,
            createdAt: new Date().toISOString()
        };
        setPlans(prev => [...prev, newPlan]);
        setActiveId(newPlan.id);
        storageService.logActivity(ViewState.PLANNING, 'CREATE', `Created scenario: ${newPlan.name}`);
    };

    const handleDeleteScenario = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (plans.length === 1) {
            alert("You must have at least one scenario.");
            return;
        }
        if (confirm("Delete this scenario?")) {
            const remaining = plans.filter(p => p.id !== id);
            setPlans(remaining);
            if (activeId === id) setActiveId(remaining[0].id);
            storageService.logActivity(ViewState.PLANNING, 'DELETE', 'Deleted scenario');
        }
    };

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(plans, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Growth_Scenarios_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        storageService.logActivity(ViewState.PLANNING, 'EXPORT', `Exported ${plans.length} scenarios`);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setStatusText("Importing Scenarios...");
        
        try {
            const text = await file.text();
            const importedData = JSON.parse(text);
            
            if (Array.isArray(importedData)) {
                // Merge logic: append new, keep existing
                // Or replace? Let's confirm or just append with (Imported) suffix
                const processedImport = importedData.map((p: any) => ({
                    ...p,
                    id: crypto.randomUUID(),
                    name: `${p.name} (Imported)`
                }));
                setPlans(prev => [...prev, ...processedImport]);
                setActiveId(processedImport[0].id);
                alert(`Imported ${processedImport.length} scenarios.`);
            } else {
                alert("Invalid file format. Expected a JSON array of plans.");
            }
        } catch (err) {
            console.error(err);
            alert("Failed to import. Check file format.");
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const runwayMonths = getRunway(projections);
    const endOfYearARR = projections[11].revenue * 12;

    return (
        <div className="flex flex-col h-full gap-6">
            <ProcessingStatus isProcessing={isProcessing} taskName={statusText} mode="LOCAL" />

            <header className="flex justify-between items-end border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Growth Planner</h2>
                    <p className="text-zinc-400 mt-2 font-light">Simulate scenarios, forecast runway, and plan hiring.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors" title="Import JSON">
                        <Upload className="w-5 h-5" />
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                    
                    <button onClick={handleExport} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors" title="Export JSON">
                        <Download className="w-5 h-5" />
                    </button>
                    
                    <button onClick={onOpenCapture} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors bg-zinc-900" title="Capture View">
                        <Camera className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">
                {/* SIDEBAR: Scenario List */}
                <div className="w-full lg:w-72 bg-zinc-900/40 border border-white/5 rounded-3xl p-4 flex flex-col gap-4 shadow-xl shrink-0 overflow-hidden">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Scenarios</h3>
                        <button onClick={handleCreateScenario} className="p-1.5 hover:bg-white/10 rounded-lg text-indigo-400 transition-colors" title="New Scenario">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                        {plans.map(p => {
                            // Quick stats for list item
                            const proj = calculateProjections(p);
                            const runway = getRunway(proj);
                            const isActive = p.id === activePlan.id;

                            return (
                                <div 
                                    key={p.id} 
                                    onClick={() => setActiveId(p.id)}
                                    className={`group p-3 rounded-xl cursor-pointer border transition-all ${isActive ? 'bg-indigo-600/10 border-indigo-500/50' : 'bg-black/20 border-transparent hover:bg-white/5 hover:border-white/10'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-zinc-400'}`}>{p.name}</span>
                                        <button onClick={(e) => handleDeleteScenario(e, p.id)} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px]">
                                        <span className={`${runway === '24+' ? 'text-emerald-400' : 'text-amber-400'} font-mono`}>Runway: {runway}m</span>
                                        <span className="text-zinc-600">|</span>
                                        <span className="text-zinc-500 font-mono">Cash: {(p.startingCash / 1000).toFixed(0)}k</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* MAIN: Planner Interface */}
                <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                    
                    {/* Top Bar: Active Plan Settings */}
                    <div className="flex items-center gap-4 bg-zinc-900/40 p-4 rounded-2xl border border-white/5">
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                            <Target className="w-5 h-5" />
                        </div>
                        <input 
                            value={activePlan.name}
                            onChange={(e) => updateActivePlan('name', e.target.value)}
                            className="bg-transparent text-xl font-bold text-white focus:outline-none border-b border-transparent focus:border-zinc-700 w-full"
                        />
                        <div className="text-xs text-zinc-500 whitespace-nowrap bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
                            Auto-saving to Local Vault
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-y-auto custom-scrollbar pr-2">
                        
                        {/* Inputs */}
                        <div className="space-y-6">
                            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-6">Key Assumptions</h4>
                                
                                <div className="space-y-5">
                                    <div>
                                        <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Starting Cash</label>
                                        <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3 transition-colors focus-within:border-indigo-500/50">
                                            <Coins className="w-4 h-4 text-emerald-500" />
                                            <input 
                                                type="number" 
                                                value={activePlan.startingCash} 
                                                onChange={(e) => updateActivePlan('startingCash', Number(e.target.value))}
                                                className="bg-transparent w-full py-2.5 px-2 text-white font-mono text-sm focus:outline-none"
                                            />
                                            <span className="text-[10px] text-zinc-500 font-bold">{settings.currency}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Current Monthly Revenue (MRR)</label>
                                        <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3 transition-colors focus-within:border-indigo-500/50">
                                            <TrendingUp className="w-4 h-4 text-indigo-500" />
                                            <input 
                                                type="number" 
                                                value={activePlan.currentRevenue} 
                                                onChange={(e) => updateActivePlan('currentRevenue', Number(e.target.value))}
                                                className="bg-transparent w-full py-2.5 px-2 text-white font-mono text-sm focus:outline-none"
                                            />
                                            <span className="text-[10px] text-zinc-500 font-bold">{settings.currency}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="flex justify-between text-[11px] text-zinc-400 font-medium mb-2">
                                            <span>MoM Growth Rate</span>
                                            <span className="text-white font-mono">{activePlan.growthRate}%</span>
                                        </label>
                                        <input 
                                            type="range" 
                                            min="0" max="50" step="0.5"
                                            value={activePlan.growthRate} 
                                            onChange={(e) => updateActivePlan('growthRate', Number(e.target.value))}
                                            className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer hover:bg-zinc-700"
                                        />
                                    </div>

                                    <div className="h-px bg-white/5 my-4"></div>

                                    <div>
                                        <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Monthly Burn (OpEx)</label>
                                        <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3 transition-colors focus-within:border-rose-500/50">
                                            <AlertTriangle className="w-4 h-4 text-rose-500" />
                                            <input 
                                                type="number" 
                                                value={activePlan.monthlyBurn} 
                                                onChange={(e) => updateActivePlan('monthlyBurn', Number(e.target.value))}
                                                className="bg-transparent w-full py-2.5 px-2 text-white font-mono text-sm focus:outline-none"
                                            />
                                            <span className="text-[10px] text-zinc-500 font-bold">{settings.currency}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Hiring Budget (Added Monthly)</label>
                                        <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3 transition-colors focus-within:border-amber-500/50">
                                            <Users className="w-4 h-4 text-amber-500" />
                                            <input 
                                                type="number" 
                                                value={activePlan.hiringBudget} 
                                                onChange={(e) => updateActivePlan('hiringBudget', Number(e.target.value))}
                                                className="bg-transparent w-full py-2.5 px-2 text-white font-mono text-sm focus:outline-none"
                                            />
                                            <span className="text-[10px] text-zinc-500 font-bold">{settings.currency}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Charts & KPIs */}
                        <div className="lg:col-span-2 flex flex-col gap-6">
                            {/* KPI Row */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-2xl">
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Proj. End ARR</p>
                                    <p className="text-xl font-bold text-emerald-400 font-mono mt-1">{endOfYearARR.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-zinc-500">{settings.currency}</span></p>
                                </div>
                                <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-2xl">
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Runway</p>
                                    <p className={`text-xl font-bold font-mono mt-1 ${runwayMonths !== '24+' ? 'text-rose-400' : 'text-white'}`}>{runwayMonths} Months</p>
                                </div>
                                <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-2xl">
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Profit Margin (Yr 2)</p>
                                    <p className={`text-xl font-bold font-mono mt-1 ${projections[23].profit > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {((projections[23].profit / projections[23].revenue) * 100).toFixed(1)}%
                                    </p>
                                </div>
                            </div>

                            {/* Revenue Chart */}
                            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-64 relative shadow-xl">
                                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider absolute top-6 left-6 z-10">Revenue Trajectory (24 Months)</h4>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={projections} margin={{ top: 30, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" tick={{fill:'#71717a', fontSize:10}} axisLine={false} tickLine={false} dy={10} minTickGap={30}/>
                                        <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px'}} itemStyle={{fontSize:'12px'}} formatter={(value:any) => `${value.toLocaleString()} ${settings.currency}`} />
                                        <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Cash Flow Chart */}
                            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-64 relative shadow-xl">
                                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider absolute top-6 left-6 z-10">Cash vs Burn</h4>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={projections} margin={{ top: 30, right: 0, left: 0, bottom: 0 }}>
                                        <XAxis dataKey="name" tick={{fill:'#71717a', fontSize:10}} axisLine={false} tickLine={false} dy={10} minTickGap={30}/>
                                        <YAxis hide />
                                        <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px'}} itemStyle={{fontSize:'12px'}} formatter={(value:any) => `${value.toLocaleString()} ${settings.currency}`} />
                                        <Bar dataKey="expenses" fill="#f43f5e" radius={[2,2,0,0]} barSize={12} name="Burn" />
                                        <Line type="monotone" dataKey="cash" stroke="#6366f1" strokeWidth={2} dot={false} name="Cash Balance" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
