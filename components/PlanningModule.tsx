
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ViewState, GrowthPlan, AppSettings } from '../types';
import { storageService } from '../services/storageService';
import { TrendingUp, Users, AlertTriangle, Save, RefreshCw, Briefcase, LineChart, Target, Camera, Coins, Plus, Trash2, Download, Upload, MoreHorizontal, FileJson, Layout, ChevronRight, Copy, Rocket, BrainCircuit, Server } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend, ComposedChart, Line } from 'recharts';
import { ProcessingStatus } from './ProcessingStatus';

interface PlanningModuleProps {
    onOpenCapture: () => void;
    settings: AppSettings;
}

const DEFAULT_PLAN: GrowthPlan = {
    id: 'default',
    name: 'Hybrid AI Strategy 2025',
    currency: 'USD',
    startingCash: 250000,
    createdAt: new Date().toISOString(),
    
    // Consulting
    consultingRevenue: 40000,
    consultingGrowth: 5,
    billableHeadcount: 2,
    avgHourlyRate: 150,
    utilization: 75,

    // Product
    productRevenue: 2000,
    productGrowth: 15,
    cloudCostPercent: 12, // High due to LLM inference

    // OpEx
    fixedOpEx: 15000,
    marketingBudget: 3000,
    salaryPerHead: 8000
};

export const PlanningModule: React.FC<PlanningModuleProps> = ({ onOpenCapture, settings }) => {
    // --- State ---
    const [plans, setPlans] = useState<GrowthPlan[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Active Plan Resolution ---
    const activePlan = useMemo(() => {
        return plans.find(p => p.id === activeId) || { ...DEFAULT_PLAN, currency: settings.currency };
    }, [plans, activeId, settings.currency]);

    // --- Data Persistence ---
    useEffect(() => {
        const load = async () => {
            setIsProcessing(true);
            setStatusText('Loading Scenarios...');
            const data = await storageService.load<GrowthPlan>('founder_os_plans');
            
            if (data && data.length > 0) {
                // Migration Logic: If old plan format, patch it
                const patchedPlans = data.map(p => ({
                    ...DEFAULT_PLAN, // Apply defaults for new fields
                    ...p, // Override with saved data
                    id: p.id || crypto.randomUUID(),
                    currency: p.currency || settings.currency
                }));
                setPlans(patchedPlans);
                setActiveId(patchedPlans[0].id);
            } else {
                const initial = [{ ...DEFAULT_PLAN, id: crypto.randomUUID(), currency: settings.currency }];
                setPlans(initial);
                setActiveId(initial[0].id);
            }
            setIsProcessing(false);
        };
        load();
    }, []);

    useEffect(() => {
        if (plans.length > 0) {
            storageService.save('founder_os_plans', plans);
        }
    }, [plans]);

    // --- Core Projection Engine ---

    const calculateProjections = (plan: GrowthPlan) => {
        const data = [];
        let cash = plan.startingCash;
        let consultRev = plan.consultingRevenue;
        let prodRev = plan.productRevenue;
        
        // Derived for headcount scaling logic
        // Simple Logic: We hire 1 consultant for every $25k in service revenue above baseline
        const revenuePerHeadCapacity = (160 * plan.avgHourlyRate) * (plan.utilization / 100); 

        for (let i = 0; i < 24; i++) { // 24 Months
            const month = new Date();
            month.setMonth(month.getMonth() + i);
            const monthName = month.toLocaleString('default', { month: 'short', year: '2-digit' });

            // 1. Revenue Growth
            consultRev = consultRev * (1 + (plan.consultingGrowth / 100));
            prodRev = prodRev * (1 + (plan.productGrowth / 100));
            const totalRev = consultRev + prodRev;

            // 2. Variable Costs
            // Headcount needed based on service revenue capacity
            const requiredConsultants = Math.ceil(consultRev / revenuePerHeadCapacity) || plan.billableHeadcount;
            // Floor at initial headcount
            const actualHeadcount = Math.max(plan.billableHeadcount, requiredConsultants);
            
            const salaryCost = actualHeadcount * plan.salaryPerHead;
            const cloudCost = prodRev * (plan.cloudCostPercent / 100);
            
            // 3. Total Expenses
            const totalExpenses = plan.fixedOpEx + plan.marketingBudget + salaryCost + cloudCost;

            // 4. Cash Flow
            const profit = totalRev - totalExpenses;
            cash = cash + profit;

            data.push({
                name: monthName,
                consultingRevenue: Math.round(consultRev),
                productRevenue: Math.round(prodRev),
                totalRevenue: Math.round(totalRev),
                expenses: Math.round(totalExpenses),
                cash: Math.round(cash),
                profit: Math.round(profit),
                headcount: actualHeadcount,
                cloudCost: Math.round(cloudCost),
                margin: totalRev > 0 ? ((profit / totalRev) * 100).toFixed(1) : 0
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
            ...activePlan,
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
        if (plans.length === 1) return alert("Keep at least one scenario.");
        if (confirm("Delete this scenario?")) {
            const remaining = plans.filter(p => p.id !== id);
            setPlans(remaining);
            if (activeId === id) setActiveId(remaining[0].id);
        }
    };

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(plans, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Growth_Scenarios_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const importedData = JSON.parse(text);
            if (Array.isArray(importedData)) {
                const processedImport = importedData.map((p: any) => ({
                    ...DEFAULT_PLAN, ...p, id: crypto.randomUUID(), name: `${p.name} (Imported)`
                }));
                setPlans(prev => [...prev, ...processedImport]);
                setActiveId(processedImport[0].id);
            }
        } catch (err) { alert("Import failed."); }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const runwayMonths = getRunway(projections);
    const endOfYearARR = projections[11].productRevenue * 12;
    const endOfYearServiceRev = projections[11].consultingRevenue * 12;

    return (
        <div className="flex flex-col h-full gap-6">
            <ProcessingStatus isProcessing={isProcessing} taskName={statusText} mode="LOCAL" />

            <header className="flex justify-between items-end border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Growth Planner</h2>
                    <p className="text-zinc-400 mt-2 font-light">Hybrid modeling for Consulting Services & AI Product Marketplaces.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors" title="Import JSON"><Upload className="w-5 h-5" /></button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                    <button onClick={handleExport} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors" title="Export JSON"><Download className="w-5 h-5" /></button>
                    <button onClick={onOpenCapture} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors bg-zinc-900" title="Capture View"><Camera className="w-5 h-5" /></button>
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">
                {/* SIDEBAR: Scenario List */}
                <div className="w-full lg:w-72 bg-zinc-900/40 border border-white/5 rounded-3xl p-4 flex flex-col gap-4 shadow-xl shrink-0 overflow-hidden">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Scenarios</h3>
                        <button onClick={handleCreateScenario} className="p-1.5 hover:bg-white/10 rounded-lg text-indigo-400 transition-colors" title="New Scenario"><Plus className="w-4 h-4" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                        {plans.map(p => {
                            const proj = calculateProjections(p);
                            const runway = getRunway(proj);
                            const isActive = p.id === activePlan.id;
                            return (
                                <div key={p.id} onClick={() => setActiveId(p.id)} className={`group p-3 rounded-xl cursor-pointer border transition-all ${isActive ? 'bg-indigo-600/10 border-indigo-500/50' : 'bg-black/20 border-transparent hover:bg-white/5 hover:border-white/10'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-zinc-400'}`}>{p.name}</span>
                                        <button onClick={(e) => handleDeleteScenario(e, p.id)} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
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
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><Target className="w-5 h-5" /></div>
                        <input value={activePlan.name} onChange={(e) => updateActivePlan('name', e.target.value)} className="bg-transparent text-xl font-bold text-white focus:outline-none border-b border-transparent focus:border-zinc-700 w-full" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-y-auto custom-scrollbar pr-2">
                        {/* Inputs Column */}
                        <div className="space-y-6">
                            {/* Service Business Inputs */}
                            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5"><Briefcase className="w-24 h-24"/></div>
                                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-6 flex items-center gap-2"><Briefcase className="w-4 h-4"/> Consulting & Services</h4>
                                <div className="space-y-5 relative z-10">
                                    <div>
                                        <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Monthly Service Revenue</label>
                                        <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3"><TrendingUp className="w-4 h-4 text-indigo-500" /><input type="number" value={activePlan.consultingRevenue} onChange={(e) => updateActivePlan('consultingRevenue', Number(e.target.value))} className="bg-transparent w-full py-2.5 px-2 text-white font-mono text-sm focus:outline-none"/><span className="text-[10px] text-zinc-500 font-bold">{settings.currency}</span></div>
                                    </div>
                                    <div>
                                        <label className="flex justify-between text-[11px] text-zinc-400 font-medium mb-2"><span>MoM Growth</span><span className="text-white font-mono">{activePlan.consultingGrowth}%</span></label>
                                        <input type="range" min="0" max="20" step="0.5" value={activePlan.consultingGrowth} onChange={(e) => updateActivePlan('consultingGrowth', Number(e.target.value))} className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"/>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Billable Staff</label>
                                            <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3"><Users className="w-4 h-4 text-zinc-500" /><input type="number" value={activePlan.billableHeadcount} onChange={(e) => updateActivePlan('billableHeadcount', Number(e.target.value))} className="bg-transparent w-full py-2.5 px-2 text-white font-mono text-sm focus:outline-none"/></div>
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Hourly Rate</label>
                                            <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3"><span className="text-zinc-500 text-xs">$</span><input type="number" value={activePlan.avgHourlyRate} onChange={(e) => updateActivePlan('avgHourlyRate', Number(e.target.value))} className="bg-transparent w-full py-2.5 px-2 text-white font-mono text-sm focus:outline-none"/></div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex justify-between text-[11px] text-zinc-400 font-medium mb-2"><span>Utilization Rate</span><span className="text-white font-mono">{activePlan.utilization}%</span></label>
                                        <input type="range" min="0" max="100" value={activePlan.utilization} onChange={(e) => updateActivePlan('utilization', Number(e.target.value))} className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"/>
                                    </div>
                                </div>
                            </div>

                            {/* Product Business Inputs */}
                            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5"><Rocket className="w-24 h-24"/></div>
                                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-6 flex items-center gap-2"><BrainCircuit className="w-4 h-4"/> AI Product & Marketplace</h4>
                                <div className="space-y-5 relative z-10">
                                    <div>
                                        <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Monthly Recurring Revenue (MRR)</label>
                                        <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3"><TrendingUp className="w-4 h-4 text-emerald-500" /><input type="number" value={activePlan.productRevenue} onChange={(e) => updateActivePlan('productRevenue', Number(e.target.value))} className="bg-transparent w-full py-2.5 px-2 text-white font-mono text-sm focus:outline-none"/><span className="text-[10px] text-zinc-500 font-bold">{settings.currency}</span></div>
                                    </div>
                                    <div>
                                        <label className="flex justify-between text-[11px] text-zinc-400 font-medium mb-2"><span>SaaS Growth (MoM)</span><span className="text-white font-mono">{activePlan.productGrowth}%</span></label>
                                        <input type="range" min="0" max="50" step="0.5" value={activePlan.productGrowth} onChange={(e) => updateActivePlan('productGrowth', Number(e.target.value))} className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"/>
                                    </div>
                                    <div>
                                        <label className="flex justify-between text-[11px] text-zinc-400 font-medium mb-2">
                                            <span className="flex items-center gap-1"><Server className="w-3 h-3"/> AI Compute Cost (% of Rev)</span>
                                            <span className="text-white font-mono">{activePlan.cloudCostPercent}%</span>
                                        </label>
                                        <input type="range" min="0" max="80" value={activePlan.cloudCostPercent} onChange={(e) => updateActivePlan('cloudCostPercent', Number(e.target.value))} className="w-full accent-rose-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"/>
                                        <p className="text-[10px] text-zinc-500 mt-1">Cost of inference/tokens per user.</p>
                                    </div>
                                </div>
                            </div>

                            {/* OpEx Inputs */}
                            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl">
                                <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-6 flex items-center gap-2"><Coins className="w-4 h-4"/> OpEx & Burn</h4>
                                <div className="space-y-5">
                                    <div>
                                        <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Starting Cash</label>
                                        <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3"><Coins className="w-4 h-4 text-zinc-500" /><input type="number" value={activePlan.startingCash} onChange={(e) => updateActivePlan('startingCash', Number(e.target.value))} className="bg-transparent w-full py-2.5 px-2 text-white font-mono text-sm focus:outline-none"/></div>
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Fixed OpEx (Office/Legal)</label>
                                        <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3"><AlertTriangle className="w-4 h-4 text-rose-500" /><input type="number" value={activePlan.fixedOpEx} onChange={(e) => updateActivePlan('fixedOpEx', Number(e.target.value))} className="bg-transparent w-full py-2.5 px-2 text-white font-mono text-sm focus:outline-none"/></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Mktg Budget</label>
                                            <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3"><input type="number" value={activePlan.marketingBudget} onChange={(e) => updateActivePlan('marketingBudget', Number(e.target.value))} className="bg-transparent w-full py-2.5 px-1 text-white font-mono text-sm focus:outline-none"/></div>
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-zinc-400 font-medium mb-1.5 block">Salary/Head</label>
                                            <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3"><input type="number" value={activePlan.salaryPerHead} onChange={(e) => updateActivePlan('salaryPerHead', Number(e.target.value))} className="bg-transparent w-full py-2.5 px-1 text-white font-mono text-sm focus:outline-none"/></div>
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
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Product ARR (Yr 1)</p>
                                    <p className="text-xl font-bold text-emerald-400 font-mono mt-1">{endOfYearARR.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-zinc-500">{settings.currency}</span></p>
                                </div>
                                <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-2xl">
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Service Rev (Yr 1)</p>
                                    <p className="text-xl font-bold text-indigo-400 font-mono mt-1">{endOfYearServiceRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                </div>
                                <div className="bg-zinc-900/40 border border-white/5 p-4 rounded-2xl">
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Runway</p>
                                    <p className={`text-xl font-bold font-mono mt-1 ${runwayMonths !== '24+' ? 'text-rose-400' : 'text-white'}`}>{runwayMonths} Months</p>
                                </div>
                            </div>

                            {/* Revenue Mix Chart (Stacked Area) */}
                            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-80 relative shadow-xl">
                                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider absolute top-6 left-6 z-10">Revenue Mix Strategy</h4>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={projections} margin={{ top: 30, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorConsult" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1}/>
                                            </linearGradient>
                                            <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" tick={{fill:'#71717a', fontSize:10}} axisLine={false} tickLine={false} dy={10} minTickGap={30}/>
                                        <YAxis tick={{fill:'#71717a', fontSize:10}} axisLine={false} tickLine={false} width={60} tickFormatter={(val) => `${val/1000}k`}/>
                                        <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px'}} itemStyle={{fontSize:'12px'}} formatter={(value:any) => `${value.toLocaleString()} ${settings.currency}`} />
                                        <Legend verticalAlign="top" height={36} wrapperStyle={{right: 0, top: 0}} />
                                        <Area type="monotone" dataKey="productRevenue" stackId="1" stroke="#10b981" fill="url(#colorProd)" name="Product (SaaS)" />
                                        <Area type="monotone" dataKey="consultingRevenue" stackId="1" stroke="#6366f1" fill="url(#colorConsult)" name="Consulting" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Profitability & Headcount */}
                            <div className="grid grid-cols-2 gap-6 h-64">
                                <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-5 relative shadow-xl">
                                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider absolute top-5 left-5 z-10">Cash vs Burn</h4>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={projections} margin={{ top: 30, right: 0, left: -20, bottom: 0 }}>
                                            <XAxis dataKey="name" tick={{fill:'#71717a', fontSize:10}} axisLine={false} tickLine={false} dy={10} minTickGap={30}/>
                                            <YAxis hide />
                                            <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px'}} itemStyle={{fontSize:'12px'}}/>
                                            <Bar dataKey="expenses" fill="#f43f5e" radius={[2,2,0,0]} barSize={8} name="Burn" />
                                            <Line type="monotone" dataKey="cash" stroke="#3b82f6" strokeWidth={2} dot={false} name="Cash Balance" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-5 relative shadow-xl">
                                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider absolute top-5 left-5 z-10">Headcount vs Cloud Cost</h4>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={projections} margin={{ top: 30, right: 0, left: -20, bottom: 0 }}>
                                            <XAxis dataKey="name" tick={{fill:'#71717a', fontSize:10}} axisLine={false} tickLine={false} dy={10} minTickGap={30}/>
                                            <YAxis yAxisId="left" hide />
                                            <YAxis yAxisId="right" orientation="right" hide />
                                            <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px'}} itemStyle={{fontSize:'12px'}}/>
                                            <Bar yAxisId="left" dataKey="cloudCost" fill="#ec4899" radius={[2,2,0,0]} barSize={8} name="Cloud Cost ($)" />
                                            <Line yAxisId="right" type="step" dataKey="headcount" stroke="#f59e0b" strokeWidth={2} dot={false} name="Consultants" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
