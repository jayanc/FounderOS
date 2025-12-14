
import React, { useState, useMemo } from 'react';
import { User, AppSettings, ReceiptData, ActionItem, ViewState } from '../types';
import { ShieldAlert, Server, Users, Activity, HardDrive, AlertTriangle, Search, Lock, Unlock, Database, TrendingUp, BarChart3, Layers, Download, RefreshCw, Key, CreditCard, Clock, Globe } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';

interface AdminModuleProps {
    currentUser: User;
    settings: AppSettings;
    // We pass current user data to visualize it as part of the aggregate
    userReceipts: ReceiptData[];
    userTasks: ActionItem[];
}

// --- MOCK DATA GENERATOR FOR "OTHER USERS" ---
const generateMockUsers = (count: number) => {
    const roles = ['User', 'Viewer', 'Admin'];
    const names = ['Alice Chen', 'Bob Miller', 'Charlie Davis', 'Diana Prince', 'Evan Wright'];
    const depts = ['Engineering', 'Marketing', 'Sales', 'Finance', 'Ops'];
    
    return Array.from({ length: count }).map((_, i) => ({
        id: `user-${i}`,
        name: names[i % names.length] + (i > 4 ? ` ${i}` : ''),
        email: `user${i}@founder-os.com`,
        role: roles[i % roles.length],
        department: depts[i % depts.length],
        status: Math.random() > 0.8 ? 'Inactive' : 'Active',
        lastActive: new Date(Date.now() - Math.random() * 1000000000).toISOString(),
        storageUsed: Math.floor(Math.random() * 500), // MB
        spendYTD: Math.floor(Math.random() * 50000),
        tasksOpen: Math.floor(Math.random() * 20),
        contractCompliance: Math.floor(Math.random() * 100)
    }));
};

export const AdminModule: React.FC<AdminModuleProps> = ({ currentUser, settings, userReceipts, userTasks }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'finance' | 'ops'>('overview');
    const [searchTerm, setSearchTerm] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Merge Real User Data with Mock Data
    const users = useMemo(() => {
        const mocks = generateMockUsers(12);
        // Inject current user
        const realUserStats = {
            id: 'current-user',
            name: currentUser.name,
            email: currentUser.email,
            role: 'Admin',
            department: 'Executive',
            status: 'Active',
            lastActive: new Date().toISOString(),
            storageUsed: 124, // Simulated
            spendYTD: userReceipts.reduce((acc, r) => acc + r.amount, 0),
            tasksOpen: userTasks.filter(t => t.status === 'Pending').length,
            contractCompliance: 92
        };
        return [realUserStats, ...mocks];
    }, [currentUser, userReceipts, userTasks]);

    // --- AGGREGATES ---
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === 'Active').length;
    const totalStorage = users.reduce((acc, u) => acc + u.storageUsed, 0);
    const totalSpend = users.reduce((acc, u) => acc + u.spendYTD, 0);
    
    const departmentSpend = useMemo(() => {
        const map: Record<string, number> = {};
        users.forEach(u => {
            map[u.department] = (map[u.department] || 0) + u.spendYTD;
        });
        return Object.entries(map).map(([name, value]) => ({ name, value }));
    }, [users]);

    const systemHealth = {
        apiLatency: '24ms',
        uptime: '99.99%',
        dbStatus: 'Operational',
        lastBackup: new Date(Date.now() - 3600000).toLocaleString()
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 1200);
    };

    const COLORS = ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#3b82f6'];

    return (
        <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end border-b border-amber-500/20 pb-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <ShieldAlert className="w-6 h-6 text-amber-500" />
                        </div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">System Administration</h2>
                    </div>
                    <p className="text-zinc-400 font-light">Centralized management, monitoring, and compliance for {settings.companyName || 'Organization'}.</p>
                </div>
                <div className="flex gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-xs font-mono text-zinc-400">SYS_OP: NORMAL</span>
                    </div>
                    <button onClick={handleRefresh} className={`p-3 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all ${isRefreshing ? 'animate-spin' : ''}`}>
                        <RefreshCw className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-1 relative overflow-hidden group hover:border-amber-500/30 transition-colors">
                    <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total Users</span>
                        <Users className="w-4 h-4 text-zinc-500 group-hover:text-amber-500 transition-colors" />
                    </div>
                    <div className="text-2xl font-bold text-white mt-2">{totalUsers}</div>
                    <div className="text-xs text-emerald-400 mt-1">{activeUsers} Active now</div>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-1 group hover:border-amber-500/30 transition-colors">
                    <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Org Storage</span>
                        <HardDrive className="w-4 h-4 text-zinc-500 group-hover:text-amber-500 transition-colors" />
                    </div>
                    <div className="text-2xl font-bold text-white mt-2">{(totalStorage / 1024).toFixed(1)} GB</div>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div className="bg-amber-500 h-full w-[45%]"></div>
                    </div>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-1 group hover:border-amber-500/30 transition-colors">
                    <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Burn Rate (MoM)</span>
                        <TrendingUp className="w-4 h-4 text-zinc-500 group-hover:text-amber-500 transition-colors" />
                    </div>
                    <div className="text-2xl font-bold text-white mt-2 font-mono">{(totalSpend / 1000).toFixed(1)}k</div>
                    <div className="text-xs text-rose-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> +12% vs last month</div>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-1 group hover:border-amber-500/30 transition-colors">
                    <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">System Latency</span>
                        <Activity className="w-4 h-4 text-zinc-500 group-hover:text-amber-500 transition-colors" />
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono">{systemHealth.apiLatency}</div>
                    <div className="text-xs text-zinc-500 mt-1">Uptime: {systemHealth.uptime}</div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-zinc-800">
                <button onClick={() => setActiveTab('overview')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Overview</button>
                <button onClick={() => setActiveTab('users')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'users' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>User Directory</button>
                <button onClick={() => setActiveTab('finance')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'finance' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Financial Aggregates</button>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 overflow-hidden flex flex-col relative">
                
                {/* 1. OVERVIEW TAB */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full overflow-y-auto custom-scrollbar">
                        <div className="space-y-6">
                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Server className="w-5 h-5 text-amber-500"/> Server Status</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                            <span className="text-sm text-zinc-300">API Gateway</span>
                                        </div>
                                        <span className="text-xs font-mono text-emerald-400">ONLINE</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                            <span className="text-sm text-zinc-300">Database Cluster (US-East)</span>
                                        </div>
                                        <span className="text-xs font-mono text-emerald-400">ONLINE</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-pulse"></div>
                                            <span className="text-sm text-zinc-300">Gemini Inference Engine</span>
                                        </div>
                                        <span className="text-xs font-mono text-amber-400">HIGH LOAD</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Lock className="w-5 h-5 text-amber-500"/> Security Audit</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" /> All admin accounts enforce MFA
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Data encrypted at rest (AES-256)
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" /> 3 Users have not rotated keys in 90 days
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-black/20 p-5 rounded-2xl border border-white/5 flex flex-col">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5 text-amber-500"/> Department Spend Distribution</h3>
                            <div className="flex-1 min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={departmentSpend}
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {departmentSpend.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', color: '#fff' }}
                                            formatter={(value: any) => [`${settings.currency} ${value.toLocaleString()}`, 'Spend']}
                                        />
                                        <Legend layout="vertical" verticalAlign="middle" align="right" />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. USER DIRECTORY TAB */}
                {activeTab === 'users' && (
                    <div className="flex flex-col h-full">
                        <div className="flex justify-between mb-4">
                            <div className="flex items-center gap-2 bg-black/30 border border-zinc-800 rounded-xl px-3 py-2 w-64">
                                <Search className="w-4 h-4 text-zinc-500" />
                                <input 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search users..." 
                                    className="bg-transparent text-sm text-white focus:outline-none w-full placeholder:text-zinc-600"
                                />
                            </div>
                            <button className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded-xl hover:bg-amber-600/30 transition-colors text-sm font-medium">
                                <Download className="w-4 h-4" /> Export CSV
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar border border-white/5 rounded-xl">
                            <table className="w-full text-left text-sm text-zinc-400">
                                <thead className="bg-zinc-950 sticky top-0 z-10 font-bold uppercase text-xs tracking-wider">
                                    <tr>
                                        <th className="p-4 border-b border-zinc-800">User</th>
                                        <th className="p-4 border-b border-zinc-800">Role</th>
                                        <th className="p-4 border-b border-zinc-800">Dept</th>
                                        <th className="p-4 border-b border-zinc-800">Status</th>
                                        <th className="p-4 border-b border-zinc-800 text-right">Spend YTD</th>
                                        <th className="p-4 border-b border-zinc-800 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800 bg-black/20">
                                    {users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                                        <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-white border border-zinc-700">
                                                        {u.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-medium">{u.name} {u.id === 'current-user' && <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1 rounded ml-1">(YOU)</span>}</div>
                                                        <div className="text-xs text-zinc-500">{u.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold border ${
                                                    u.role === 'Admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                                                    'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                }`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="p-4">{u.department}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${u.status === 'Active' ? 'bg-emerald-500' : 'bg-zinc-600'}`}></div>
                                                    {u.status}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right font-mono text-white">
                                                {settings.currency} {u.spendYTD.toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 3. FINANCE REPORTING */}
                {activeTab === 'finance' && (
                    <div className="h-full flex flex-col gap-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                <span className="text-xs text-zinc-500 uppercase font-bold">Highest Spender</span>
                                <div className="text-lg font-bold text-white mt-1">Bob Miller</div>
                                <div className="text-xs text-rose-400 font-mono mt-1">$42,300 YTD</div>
                            </div>
                            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                <span className="text-xs text-zinc-500 uppercase font-bold">Avg Spend / User</span>
                                <div className="text-lg font-bold text-white mt-1">{(totalSpend / totalUsers).toFixed(0)}</div>
                                <div className="text-xs text-zinc-500 font-mono mt-1">{settings.currency}</div>
                            </div>
                            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                <span className="text-xs text-zinc-500 uppercase font-bold">Compliance Flags</span>
                                <div className="text-lg font-bold text-amber-400 mt-1">3 Users</div>
                                <div className="text-xs text-zinc-500 mt-1">Missing receipts > $1k</div>
                            </div>
                        </div>

                        <div className="flex-1 bg-black/20 rounded-2xl border border-white/5 p-6 relative">
                            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-6">Spend by Department</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={departmentSpend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis dataKey="name" tick={{fill:'#71717a', fontSize:12}} axisLine={false} tickLine={false} dy={10} />
                                    <YAxis tick={{fill:'#71717a', fontSize:12}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                        contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff'}}
                                    />
                                    <Bar dataKey="value" fill="#f59e0b" radius={[4,4,0,0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Import helper
import { MoreHorizontal, CheckCircle2 } from 'lucide-react';
