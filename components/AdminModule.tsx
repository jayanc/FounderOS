
import React, { useState, useMemo, useEffect } from 'react';
import { User, AppSettings, ReceiptData, ActionItem, ViewState, UserRole, UserStatus } from '../types';
import { ShieldAlert, Server, Users, Activity, HardDrive, AlertTriangle, Search, Lock, Unlock, Database, TrendingUp, BarChart3, Layers, Download, RefreshCw, Key, CreditCard, Clock, Globe, Plus, Pencil, Trash2, CheckCircle2, MoreHorizontal, X, Save, Shield, Phone, Mail, Loader2, Send, Filter, Ban, Power, Timer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { storageService } from '../services/storageService';

interface AdminModuleProps {
    currentUser: User;
    settings: AppSettings;
    userReceipts: ReceiptData[];
    userTasks: ActionItem[];
}

const MODULES_LIST = [
    { id: ViewState.DASHBOARD, label: 'Dashboard & Briefing' },
    { id: ViewState.FINANCE, label: 'Finance & Accounting' },
    { id: ViewState.OPS, label: 'Operations & Tasks' },
    { id: ViewState.CONTRACTS, label: 'Contracts & Legal' },
    { id: ViewState.TIMESHEETS, label: 'Timesheets & HR' },
    { id: ViewState.PLANNING, label: 'Growth Planning' },
    { id: ViewState.INVOICES, label: 'Invoicing' },
    { id: ViewState.SETTINGS, label: 'Settings & Connect' }
];

export const AdminModule: React.FC<AdminModuleProps> = ({ currentUser, settings, userReceipts, userTasks }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'finance'>('overview');
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<'All' | 'Admin' | 'User' | 'Viewer'>('All');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [sendingInviteFor, setSendingInviteFor] = useState<string | null>(null);
    
    // User Management State
    const [users, setUsers] = useState<User[]>([]);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    
    // Form State
    const [formData, setFormData] = useState<Partial<User>>({
        name: '',
        email: '',
        phoneNumber: '',
        role: 'User',
        status: 'Active',
        password: '',
        allowedModules: MODULES_LIST.map(m => m.id), // Default all
        department: 'General'
    });

    // Load users from storageService (GCP Simulation)
    useEffect(() => {
        loadUsers();
    }, [currentUser]);

    const loadUsers = async () => {
        setIsRefreshing(true);
        try {
            const storedUsers = await storageService.getSystemUsers();
            
            // Ensure current user is in the list for the UI if local storage is empty initially
            let allUsers = storedUsers;
            if (storedUsers.length === 0 && currentUser.email) {
                 allUsers = [currentUser];
            }
            
            // Deduplicate based on email
            const uniqueUsers = Array.from(new Map(allUsers.map(item => [item.email, item])).values());
            setUsers(uniqueUsers);
        } catch (e) {
            console.error("Failed to load users", e);
        } finally {
            setIsRefreshing(false);
        }
    };

    // User CRUD Operations
    const handleAddUser = () => {
        setEditingUser(null);
        setFormData({
            name: '',
            email: '',
            phoneNumber: '',
            role: 'User',
            status: 'Active',
            password: '',
            allowedModules: MODULES_LIST.map(m => m.id),
            department: 'General',
            mfaVerified: false
        });
        setIsUserModalOpen(true);
    };

    const handleEditUser = (user: User) => {
        setEditingUser(user);
        setFormData({
            ...user,
            password: '', // Don't show existing password
            allowedModules: user.allowedModules || [], // Ensure array
            status: user.status || 'Active'
        });
        setIsUserModalOpen(true);
    };

    const handleDeleteUser = async (userId: string) => {
        if (userId === currentUser.id) return alert("Cannot delete yourself.");
        if (confirm("Are you sure you want to delete this user? This cannot be undone.")) {
            // Optimistic update
            setUsers(prev => prev.filter(u => u.id !== userId));
            try {
                await storageService.deleteSystemUser(userId);
            } catch(e) {
                alert("Failed to delete user on server. Please refresh.");
                loadUsers();
            }
        }
    };

    const handleSaveUser = async () => {
        if (!formData.name || !formData.email) return alert("Name and Email are required.");
        
        setIsSaving(true);
        
        const userToSave: User = {
            ...editingUser,
            id: editingUser?.id || crypto.randomUUID(),
            name: formData.name || '',
            email: formData.email || '',
            phoneNumber: formData.phoneNumber || '',
            role: (formData.role as UserRole) || 'User',
            status: (formData.status as UserStatus) || 'Active',
            department: formData.department || '',
            mfaVerified: formData.mfaVerified || false,
            // Only update password if provided
            ...(formData.password ? { password: formData.password } : {}),
            allowedModules: formData.allowedModules || [], // FIX: Default to empty array
            lastActive: editingUser?.lastActive || new Date().toISOString()
        };

        // 1. Optimistic Update (Immediate Feedback)
        setUsers(prev => {
            const index = prev.findIndex(u => u.id === userToSave.id);
            if (index > -1) {
                const updated = [...prev];
                updated[index] = userToSave;
                return updated;
            }
            return [userToSave, ...prev];
        });

        // 2. Close Modal Immediately
        setIsUserModalOpen(false);
        setIsSaving(false); 

        // 3. Persist Background
        try {
            await storageService.saveSystemUser(userToSave);
        } catch (e: any) {
            console.error(e);
            alert(`Background Save Error: ${e.message}`);
            // Revert or reload if needed, but rarely needed for non-critical admin ops
            loadUsers();
        }
    };

    const handleSendInvite = async (user: User) => {
        if (!user.id) return;
        setSendingInviteFor(user.id);
        try {
            await storageService.sendUserInvite(user);
            
            // Optimistic update for UI feedback
            setUsers(prev => prev.map(u => 
                u.id === user.id 
                ? { ...u, status: 'Pending Validation', verificationSentAt: new Date().toISOString() } 
                : u
            ));
            
            alert(`Invitation sent to ${user.email}. Status updated to 'Pending Validation'.`);
        } catch (e: any) {
            console.error(e);
            alert("Failed to send invite: " + e.message);
        } finally {
            setSendingInviteFor(null);
        }
    };

    const handleResetPassword = (user: User) => {
        if(confirm(`Send password reset email to ${user.email}?`)) {
            storageService.initiatePasswordReset(user.email);
            alert("Reset email queued.");
        }
    }

    const toggleModulePermission = (moduleId: ViewState) => {
        setFormData(prev => {
            const current = prev.allowedModules || [];
            if (current.includes(moduleId)) {
                return { ...prev, allowedModules: current.filter(id => id !== moduleId) };
            } else {
                return { ...prev, allowedModules: [...current, moduleId] };
            }
        });
    };

    // --- AGGREGATES ---
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status !== 'Suspended').length; 
    const totalStorage = 124 * users.length; // Simulated
    
    const departmentSpend = useMemo(() => {
        // Mock spend distribution
        return [
            { name: 'Engineering', value: 45000 },
            { name: 'Marketing', value: 22000 },
            { name: 'Sales', value: 38000 },
            { name: 'Ops', value: 15000 }
        ];
    }, []);

    const systemHealth = {
        apiLatency: '24ms',
        uptime: '99.99%',
        dbStatus: 'Operational',
    };

    const COLORS = ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#3b82f6'];

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'All' || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    return (
        <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500 relative">
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
                        <span className="text-xs font-mono text-zinc-400">GCP SYNC: ACTIVE</span>
                    </div>
                    <button onClick={() => loadUsers()} className={`p-3 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all ${isRefreshing ? 'animate-spin' : ''}`}>
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
                    <div className="text-xs text-emerald-400 mt-1">{activeUsers} Active Accounts</div>
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
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">System Health</span>
                        <Activity className="w-4 h-4 text-zinc-500 group-hover:text-amber-500 transition-colors" />
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono">100%</div>
                    <div className="text-xs text-zinc-500 mt-1">Uptime: {systemHealth.uptime}</div>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-1 group hover:border-amber-500/30 transition-colors">
                    <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Burn Rate</span>
                        <TrendingUp className="w-4 h-4 text-zinc-500 group-hover:text-amber-500 transition-colors" />
                    </div>
                    <div className="text-2xl font-bold text-white mt-2 font-mono">120k</div>
                    <div className="text-xs text-rose-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> +12% vs last month</div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-zinc-800">
                <button onClick={() => setActiveTab('overview')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Overview</button>
                <button onClick={() => setActiveTab('users')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'users' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>User Directory</button>
                <button onClick={() => setActiveTab('finance')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'finance' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Reporting</button>
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
                        <div className="flex justify-between mb-4 gap-4">
                            <div className="flex items-center gap-2 bg-black/30 border border-zinc-800 rounded-xl px-3 py-2 flex-1 max-w-md">
                                <Search className="w-4 h-4 text-zinc-500" />
                                <input 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search users by name or email..." 
                                    className="bg-transparent text-sm text-white focus:outline-none w-full placeholder:text-zinc-600"
                                />
                            </div>
                            
                            <div className="flex gap-2">
                                <div className="flex items-center gap-2 bg-black/30 border border-zinc-800 rounded-xl px-3 py-2">
                                    <Filter className="w-4 h-4 text-zinc-500" />
                                    <select 
                                        value={roleFilter}
                                        onChange={(e) => setRoleFilter(e.target.value as any)}
                                        className="bg-transparent text-sm text-white focus:outline-none"
                                    >
                                        <option value="All">All Roles</option>
                                        <option value="Admin">Admin</option>
                                        <option value="User">User</option>
                                        <option value="Viewer">Viewer</option>
                                    </select>
                                </div>
                                
                                <button onClick={handleAddUser} className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-colors text-sm font-bold shadow-lg shadow-amber-900/20 whitespace-nowrap">
                                    <Plus className="w-4 h-4" /> Add User
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar border border-white/5 rounded-xl">
                            <table className="w-full text-left text-sm text-zinc-400">
                                <thead className="bg-zinc-950 sticky top-0 z-10 font-bold uppercase text-xs tracking-wider">
                                    <tr>
                                        <th className="p-4 border-b border-zinc-800">User</th>
                                        <th className="p-4 border-b border-zinc-800">Role</th>
                                        <th className="p-4 border-b border-zinc-800">Status</th>
                                        <th className="p-4 border-b border-zinc-800">Access</th>
                                        <th className="p-4 border-b border-zinc-800 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800 bg-black/20">
                                    {filteredUsers.map(u => (
                                        <tr key={u.id || u.email} className={`hover:bg-white/5 transition-colors ${u.status === 'Suspended' ? 'opacity-50' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-white border border-zinc-700 relative">
                                                        {u.name.charAt(0)}
                                                        {/* Status Dot */}
                                                        {u.isEmailVerified && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-900" title="Verified"/>}
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-medium flex items-center gap-2">
                                                            {u.name} 
                                                            {u.id === currentUser.id && <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1 rounded ml-1">(YOU)</span>}
                                                        </div>
                                                        <div className="text-xs text-zinc-500 flex gap-2">
                                                            <span>{u.department || 'General'}</span>
                                                            <span>•</span>
                                                            <span className="flex items-center gap-1"><Mail className="w-3 h-3"/> {u.email}</span>
                                                        </div>
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
                                            <td className="p-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold flex items-center gap-1 w-fit ${
                                                        u.status === 'Suspended' ? 'bg-red-500/10 text-red-400' : 
                                                        u.status === 'Pending Validation' ? 'bg-indigo-500/10 text-indigo-400' :
                                                        'bg-emerald-500/10 text-emerald-400'
                                                    }`}>
                                                        {u.status === 'Suspended' ? <Ban className="w-3 h-3"/> : 
                                                         u.status === 'Pending Validation' ? <Timer className="w-3 h-3"/> : 
                                                         <CheckCircle2 className="w-3 h-3"/>}
                                                        {u.status || 'Active'}
                                                    </span>
                                                    {u.status === 'Pending Validation' && u.verificationSentAt && (
                                                        <span className="text-[9px] text-zinc-500 ml-1">Sent: {new Date(u.verificationSentAt).toLocaleDateString()}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-1">
                                                    <div className={`w-2 h-2 rounded-full ${u.allowedModules ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                                                    <span className="text-xs">{u.allowedModules ? `${u.allowedModules.length} Modules` : 'Full Access'}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button 
                                                        onClick={() => handleSendInvite(u)} 
                                                        disabled={sendingInviteFor === u.id}
                                                        className="p-2 hover:bg-emerald-500/10 rounded-lg text-zinc-400 hover:text-emerald-400 transition-colors disabled:opacity-50" 
                                                        title="Send Verify Email / Invite"
                                                    >
                                                        {sendingInviteFor === u.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4" />}
                                                    </button>
                                                    <button onClick={() => handleEditUser(u)} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors" title="Edit User">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    {u.id !== currentUser.id && (
                                                        <button onClick={() => handleDeleteUser(u.id!)} className="p-2 hover:bg-rose-500/10 rounded-lg text-zinc-400 hover:text-rose-400 transition-colors" title="Delete User">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredUsers.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-zinc-500">
                                                No users found matching your filters.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 3. FINANCE REPORTING (Placeholder) */}
                {activeTab === 'finance' && (
                    <div className="flex items-center justify-center h-full text-zinc-500">
                        Detailed reporting coming soon...
                    </div>
                )}
            </div>

            {/* ADD/EDIT USER MODAL */}
            {isUserModalOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-zinc-950 border border-zinc-800 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                {editingUser ? <Pencil className="w-5 h-5 text-indigo-400"/> : <Plus className="w-5 h-5 text-emerald-400"/>}
                                {editingUser ? 'Edit User & Permissions' : 'Add New User'}
                            </h3>
                            <button onClick={() => setIsUserModalOpen(false)}><X className="w-6 h-6 text-zinc-400 hover:text-white"/></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-zinc-900/50">
                            {/* Identity Section */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Identity</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-zinc-400 block mb-1">Full Name</label>
                                        <input 
                                            value={formData.name} 
                                            onChange={e => setFormData({...formData, name: e.target.value})}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 outline-none"
                                            placeholder="Jane Doe"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-400 block mb-1">Email Address</label>
                                        <input 
                                            value={formData.email}
                                            onChange={e => setFormData({...formData, email: e.target.value})}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 outline-none"
                                            placeholder="jane@company.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-400 block mb-1">Phone Number (For MFA)</label>
                                        <input 
                                            value={formData.phoneNumber}
                                            onChange={e => setFormData({...formData, phoneNumber: e.target.value})}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 outline-none"
                                            placeholder="+1 555 000 0000"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-400 block mb-1">Department</label>
                                        <input 
                                            value={formData.department}
                                            onChange={e => setFormData({...formData, department: e.target.value})}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 outline-none"
                                            placeholder="Engineering"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Access & Status */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Key className="w-3 h-3"/> Access & Status</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-zinc-400 block mb-1">System Role</label>
                                        <select 
                                            value={formData.role} 
                                            onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 outline-none"
                                        >
                                            <option value="User">User</option>
                                            <option value="Viewer">Viewer</option>
                                            <option value="Admin">Admin</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-400 block mb-1">Account Status</label>
                                        <select 
                                            value={formData.status || 'Active'} 
                                            onChange={e => setFormData({...formData, status: e.target.value as UserStatus})}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 outline-none"
                                        >
                                            <option value="Active">Active</option>
                                            <option value="Pending Validation">Pending Validation</option>
                                            <option value="Suspended">Suspended</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Security Section */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Lock className="w-3 h-3"/> Security Credentials</h4>
                                <div className="flex gap-4 items-end">
                                    <div className="flex-1">
                                        <label className="text-xs text-zinc-400 block mb-1">Set New Password {editingUser && '(Leave blank to keep current)'}</label>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-2.5 w-4 h-4 text-zinc-600" />
                                            <input 
                                                type="password"
                                                value={formData.password}
                                                onChange={e => setFormData({...formData, password: e.target.value})}
                                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-3 py-2 text-white focus:border-indigo-500 outline-none"
                                                placeholder="********"
                                            />
                                        </div>
                                    </div>
                                    {editingUser && (
                                        <button onClick={() => handleResetPassword(editingUser)} className="px-4 py-2 border border-zinc-700 hover:border-zinc-500 hover:text-white text-zinc-400 rounded-xl text-xs font-medium transition-colors mb-0.5">
                                            Send Reset Email
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Access Control Matrix */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Shield className="w-3 h-3"/> Module Permissions</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {MODULES_LIST.map(mod => {
                                        const isAllowed = formData.allowedModules?.includes(mod.id);
                                        return (
                                            <div 
                                                key={mod.id}
                                                onClick={() => toggleModulePermission(mod.id)}
                                                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isAllowed ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}
                                            >
                                                <span className={`text-sm font-medium ${isAllowed ? 'text-indigo-200' : 'text-zinc-500'}`}>{mod.label}</span>
                                                <div className={`w-5 h-5 rounded flex items-center justify-center border ${isAllowed ? 'bg-indigo-500 border-indigo-500' : 'border-zinc-700'}`}>
                                                    {isAllowed && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-zinc-800 bg-zinc-900 flex justify-end gap-3">
                            <button onClick={() => setIsUserModalOpen(false)} className="px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors font-medium">Cancel</button>
                            <button onClick={handleSaveUser} disabled={isSaving} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50">
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4" />}
                                Save User
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
