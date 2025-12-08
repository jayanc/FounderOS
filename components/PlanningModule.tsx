
import React, { useState, useEffect, useMemo } from 'react';
import { ViewState, GrowthPlan } from '../types';
import { storageService } from '../services/storageService';
import { TrendingUp, DollarSign, Users, AlertTriangle, Save, RefreshCw, Briefcase, LineChart, Target, Camera } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend, ComposedChart, Line } from 'recharts';

interface PlanningModuleProps {
    onOpenCapture: () => void;
}

export const PlanningModule: React.FC<PlanningModuleProps> = ({ onOpenCapture }) => {
    // Default Scenario
    const [plan, setPlan] = useState<GrowthPlan>({
        id: 'default_plan',
        name: 'Aggressive Growth 2024',
        startingCash: 500000,
        currentRevenue: 25000, // MRR
        growthRate: 15, // 15% MoM
        monthlyBurn: 40000,
        hiringBudget: 5000, // Increase burn by this amount monthly
        createdAt: new Date().toISOString()
    });

    useEffect(() => {
        const load = async () => {
            const data = await storageService.load<GrowthPlan>('founder_os_plans');
            if (data && data.length > 0) setPlan(data[0]);
        };
        load();
    }, []);

    const handleSave = () => {
        storageService.save('founder_os_plans', [plan]);
        storageService.logActivity(ViewState.PLANNING, 'EDIT', 'Updated financial model');
        alert("Scenario Saved");
    };

    const projections = useMemo(() => {
        const data = [];
        let cash = plan.startingCash;
        let revenue = plan.currentRevenue;
        let expenses = plan.monthlyBurn;

        for (let i = 0; i < 12; i++) {
            const month = new Date();
            month.setMonth(month.getMonth() + i);
            const monthName = month.toLocaleString('default', { month: 'short', year: '2-digit' });

            revenue = revenue * (1 + (plan.growthRate / 100));
            expenses = expenses + plan.hiringBudget; // Simplified step function for hiring
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
    }, [plan]);

    const runwayMonths = useMemo(() => {
        const negativeCashIndex = projections.findIndex(p => p.cash < 0);
        return negativeCashIndex === -1 ? '12+' : negativeCashIndex;
    }, [projections]);

    const endOfYearARR = projections[11].revenue * 12;

    return (
        <div className="flex flex-col h-full gap-8">
            <header className="flex justify-between items-end border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Growth Planner</h2>
                    <p className="text-zinc-400 mt-2 font-light">Simulate runway, hiring impact, and revenue trajectory.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={onOpenCapture} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors bg-zinc-900" title="Capture Scenario">
                        <Camera className="w-5 h-5" />
                    </button>
                    <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/20 transition-all">
                        <Save className="w-4 h-4" /> Save Scenario
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full min-h-0 overflow-y-auto custom-scrollbar pr-2">
                
                {/* Inputs Panel */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl">
                        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                            <Target className="w-5 h-5 text-indigo-400" /> Assumptions
                        </h3>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Starting Cash</label>
                                <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3">
                                    <DollarSign className="w-4 h-4 text-emerald-500" />
                                    <input 
                                        type="number" 
                                        value={plan.startingCash} 
                                        onChange={(e) => setPlan({...plan, startingCash: Number(e.target.value)})}
                                        className="bg-transparent w-full py-3 px-2 text-white font-mono focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Current MRR</label>
                                <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3">
                                    <DollarSign className="w-4 h-4 text-indigo-500" />
                                    <input 
                                        type="number" 
                                        value={plan.currentRevenue} 
                                        onChange={(e) => setPlan({...plan, currentRevenue: Number(e.target.value)})}
                                        className="bg-transparent w-full py-3 px-2 text-white font-mono focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="flex justify-between text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                                    <span>MoM Growth Rate</span>
                                    <span className="text-white">{plan.growthRate}%</span>
                                </label>
                                <input 
                                    type="range" 
                                    min="0" max="100" step="1"
                                    value={plan.growthRate} 
                                    onChange={(e) => setPlan({...plan, growthRate: Number(e.target.value)})}
                                    className="w-full accent-indigo-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div className="pt-4 border-t border-white/5">
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Monthly OpEx (Burn)</label>
                                <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3">
                                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                                    <input 
                                        type="number" 
                                        value={plan.monthlyBurn} 
                                        onChange={(e) => setPlan({...plan, monthlyBurn: Number(e.target.value)})}
                                        className="bg-transparent w-full py-3 px-2 text-white font-mono focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Hiring Budget (Monthly Add)</label>
                                <div className="flex items-center bg-black/30 rounded-xl border border-zinc-800 px-3">
                                    <Users className="w-4 h-4 text-amber-500" />
                                    <input 
                                        type="number" 
                                        value={plan.hiringBudget} 
                                        onChange={(e) => setPlan({...plan, hiringBudget: Number(e.target.value)})}
                                        className="bg-transparent w-full py-3 px-2 text-white font-mono focus:outline-none"
                                    />
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-1">Simulates adding this cost cumulatively each month.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Charts Panel */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-zinc-900/40 border border-white/5 p-5 rounded-2xl">
                            <p className="text-xs text-zinc-500 font-bold uppercase">Proj. End ARR</p>
                            <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">${endOfYearARR.toLocaleString()}</p>
                        </div>
                        <div className="bg-zinc-900/40 border border-white/5 p-5 rounded-2xl">
                            <p className="text-xs text-zinc-500 font-bold uppercase">Est. Runway</p>
                            <p className={`text-2xl font-bold font-mono mt-1 ${runwayMonths !== '12+' ? 'text-rose-400' : 'text-white'}`}>{runwayMonths} Months</p>
                        </div>
                        <div className="bg-zinc-900/40 border border-white/5 p-5 rounded-2xl">
                            <p className="text-xs text-zinc-500 font-bold uppercase">12m Total Spend</p>
                            <p className="text-2xl font-bold text-white font-mono mt-1">${projections.reduce((a,b) => a + b.expenses, 0).toLocaleString()}</p>
                        </div>
                    </div>

                    {/* Revenue Chart */}
                    <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-80 relative shadow-xl">
                        <h4 className="text-sm font-bold text-zinc-300 absolute top-6 left-6 z-10">Revenue Trajectory</h4>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={projections} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" tick={{fill:'#71717a', fontSize:10}} axisLine={false} tickLine={false} dy={10}/>
                                <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px'}} itemStyle={{fontSize:'12px'}} formatter={(value:any) => `$${value.toLocaleString()}`} />
                                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Cash vs Burn Chart */}
                    <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-80 relative shadow-xl">
                        <h4 className="text-sm font-bold text-zinc-300 absolute top-6 left-6 z-10">Cash Flow Forecast</h4>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={projections} margin={{ top: 40, right: 0, left: 0, bottom: 0 }}>
                                <XAxis dataKey="name" tick={{fill:'#71717a', fontSize:10}} axisLine={false} tickLine={false} dy={10}/>
                                <YAxis tick={{fill:'#71717a', fontSize:10}} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px'}} itemStyle={{fontSize:'12px'}} formatter={(value:any) => `$${value.toLocaleString()}`} />
                                <Bar dataKey="expenses" fill="#f43f5e" radius={[4,4,0,0]} barSize={20} name="Burn" />
                                <Line type="monotone" dataKey="cash" stroke="#6366f1" strokeWidth={2} dot={false} name="Cash Balance" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};
