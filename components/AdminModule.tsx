
import React, { useState, useMemo, useEffect } from 'react';
import { User, AppSettings, ReceiptData, ActionItem, ViewState, UserRole, UserStatus, Organization } from '../types';
import { ShieldAlert, Server, Users, Activity, HardDrive, AlertTriangle, Search, Lock, Unlock, Database, TrendingUp, BarChart3, Layers, Download, RefreshCw, Key, CreditCard, Clock, Globe, Plus, Pencil, Trash2, CheckCircle2, MoreHorizontal, X, Save, Shield, Phone, Mail, Loader2, Send, Filter, Ban, Power, Timer, Smartphone, Building2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { storageService } from '../services/storageService';

interface AdminModuleProps {
    currentUser: User;
    settings: AppSettings;
    userReceipts: ReceiptData[];
    userTasks: ActionItem[];
}

const APP_VERSION = 'v1.4.0 (Multi-Tenant)';

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
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'tenants'>('overview');
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<'All' | 'Admin' | 'User' | 'Viewer'>('All');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // Multi-Tenancy State
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [showOrgModal, setShowOrgModal] = useState(false);
    const [newOrgName, setNewOrgName] = useState('');
    const [newOrgAdminEmail, setNewOrgAdminEmail] = useState('');
    const [newOrgAdminName, setNewOrgAdminName] = useState('');

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
        allowedModules: MODULES_LIST.map(m => m.id),
        department: 'General'
    });

    useEffect(() => {
        if (currentUser.role === 'SuperAdmin') {
            loadOrganizations();
        }
        loadUsers();
    }, [currentUser]);

    const loadOrganizations = async () => {
        const orgs = await storageService.getOrganizations();
        setOrganizations(orgs);
    };

    const loadUsers = async () => {
        setIsRefreshing(true);
        try {
            const storedUsers = await storageService.getSystemUsers();
            // In a real app, verify we only got users for our Org. Firestore rules + service logic should handle this.
            setUsers(storedUsers);
        } catch (e) {
            console.error("Failed to load users", e);
        } finally {
            setIsRefreshing(false);
        }
    };

    // --- TENANT ACTIONS (Super Admin Only) ---
    const handleCreateTenant = async () => {
        if (!newOrgName || !newOrgAdminEmail) return alert("Name and Admin Email required.");
        setIsSaving(true);
        try {
            const orgId = await storageService.createOrganization(newOrgName, newOrgAdminEmail, newOrgAdminName);
            
            // Create the initial Admin User for that Org
            const adminUser: User = {
                id: crypto.randomUUID(),
                organizationId: orgId,
                name: newOrgAdminName || 'Admin',
                email: newOrgAdminEmail,
                role: 'Admin',
                status: 'Active',
                mfaVerified: false,
                allowedModules: MODULES_LIST.map(m => m.id)
            };
            
            await storageService.saveSystemUser(adminUser);
            await storageService.sendUserInvite(adminUser); // Optional: send invite immediately

            alert(`Organization "${newOrgName}" created! Admin invite sent to ${newOrgAdminEmail}.`);
            setShowOrgModal(false);
            setNewOrgName('');
            setNewOrgAdminEmail('');
            loadOrganizations();
        } catch (e: any) {
            alert("Failed to create tenant: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    // --- USER ACTIONS ---
    const handleAddUser = () => {
        setEditingUser(null);
        setFormData({
            name: '',
            email: '',
            role: 'User',
            status: 'Active',
            password: '',
            allowedModules: MODULES_LIST.map(m => m.id),
            department: 'General',
            mfaVerified: false
        });
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async () => {
        if (!formData.name || !formData.email) return alert("Name and Email are required.");
        setIsSaving(true);
        
        const userToSave: User = {
            ...editingUser,
            organizationId: currentUser.organizationId, // IMPORTANT: Scope to current admin's org
            id: editingUser?.id || crypto.randomUUID(),
            name: formData.name || '',
            email: formData.email || '',
            phoneNumber: formData.phoneNumber || '',
            role: (formData.role as UserRole) || 'User',
            status: (formData.status as UserStatus) || 'Active',
            department: formData.department || '',
            mfaVerified: formData.mfaVerified || false,
            ...(formData.password ? { password: formData.password } : {}),
            allowedModules: formData.allowedModules || [], 
            lastActive: editingUser?.lastActive || new Date().toISOString()
        };

        setUsers(prev => {
            const index = prev.findIndex(u => u.id === userToSave.id);
            if (index > -1) {
                const updated = [...prev];
                updated[index] = userToSave;
                return updated;
            }
            return [userToSave, ...prev];
        });

        setIsUserModalOpen(false);
        setIsSaving(false); 

        try {
            await storageService.saveSystemUser(userToSave);
        } catch (e: any) {
            console.error(e);
            alert(`Background Save Error: ${e.message}`);
            loadUsers();
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (userId === currentUser.id) return alert("Cannot delete yourself.");
        if (confirm("Delete this user?")) {
            setUsers(prev => prev.filter(u => u.id !== userId));
            await storageService.deleteSystemUser(userId);
        }
    };

    const toggleModulePermission = (moduleId: ViewState) => {
        setFormData(prev => {
            const current = prev.allowedModules || [];
            return current.includes(moduleId) 
                ? { ...prev, allowedModules: current.filter(id => id !== moduleId) }
                : { ...prev, allowedModules: [...current, moduleId] };
        });
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'All' || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    return (
        <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500 relative">
            <div className="flex flex-col md:flex-row justify-between items-end border-b border-amber-500/20 pb-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <ShieldAlert className="w-6 h-6 text-amber-500" />
                        </div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">
                            {currentUser.role === 'SuperAdmin' ? 'Global Platform Admin' : 'Organization Admin'}
                        </h2>
                    </div>
                    <p className="text-zinc-400 font-light flex items-center gap-2">
                        Managing {currentUser.role === 'SuperAdmin' ? 'All Tenants' : settings.companyName || 'My Organization'}
                        <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">{APP_VERSION}</span>
                    </p>
                </div>
            </div>

            <div className="flex border-b border-zinc-800">
                <button onClick={() => setActiveTab('overview')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Overview</button>
                <button onClick={() => setActiveTab('users')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'users' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Users</button>
                {currentUser.role === 'SuperAdmin' && (
                    <button onClick={() => setActiveTab('tenants')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'tenants' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Tenants</button>
                )}
            </div>

            <div className="flex-1 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 overflow-hidden flex flex-col relative">
                
                {/* 1. OVERVIEW TAB */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-black/20 p-6 rounded-2xl border border-white/5">
                            <h3 className="text-zinc-400 text-sm font-bold uppercase mb-2">Total Users</h3>
                            <p className="text-4xl font-bold text-white">{users.length}</p>
                        </div>
                        {currentUser.role === 'SuperAdmin' && (
                            <div className="bg-black/20 p-6 rounded-2xl border border-white/5">
                                <h3 className="text-zinc-400 text-sm font-bold uppercase mb-2">Active Tenants</h3>
                                <p className="text-4xl font-bold text-emerald-400">{organizations.length}</p>
                            </div>
                        )}
                        <div className="bg-black/20 p-6 rounded-2xl border border-white/5">
                            <h3 className="text-zinc-400 text-sm font-bold uppercase mb-2">System Status</h3>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-emerald-400 font-medium">Operational</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. USER TAB */}
                {activeTab === 'users' && (
                    <div className="flex flex-col h-full">
                        <div className="flex justify-between mb-4 gap-4">
                            <div className="flex items-center gap-2 bg-black/30 border border-zinc-800 rounded-xl px-3 py-2 flex-1 max-w-md">
                                <Search className="w-4 h-4 text-zinc-500" />
                                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="bg-transparent text-sm text-white focus:outline-none w-full" />
                            </div>
                            <button onClick={handleAddUser} className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-colors text-sm font-bold shadow-lg shadow-amber-900/20">
                                <Plus className="w-4 h-4" /> Add User
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar border border-white/5 rounded-xl">
                            <table className="w-full text-left text-sm text-zinc-400">
                                <thead className="bg-zinc-950 sticky top-0 z-10 font-bold uppercase text-xs tracking-wider">
                                    <tr>
                                        <th className="p-4 border-b border-zinc-800">User</th>
                                        <th className="p-4 border-b border-zinc-800">Role</th>
                                        <th className="p-4 border-b border-zinc-800">Status</th>
                                        <th className="p-4 border-b border-zinc-800 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800 bg-black/20">
                                    {filteredUsers.map(u => (
                                        <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                            <td className="p-4 flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-white">{u.name.charAt(0)}</div>
                                                <div>
                                                    <div className="text-white font-medium">{u.name}</div>
                                                    <div className="text-xs text-zinc-500">{u.email}</div>
                                                </div>
                                            </td>
                                            <td className="p-4"><span className="px-2 py-1 bg-zinc-800 rounded text-xs font-bold">{u.role}</span></td>
                                            <td className="p-4"><span className="text-emerald-400 text-xs">{u.status}</span></td>
                                            <td className="p-4 text-right">
                                                {u.id !== currentUser.id && (
                                                    <button onClick={() => handleDeleteUser(u.id!)} className="p-2 hover:bg-rose-500/10 rounded text-rose-400"><Trash2 className="w-4 h-4" /></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 3. TENANTS TAB (Super Admin Only) */}
                {activeTab === 'tenants' && currentUser.role === 'SuperAdmin' && (
                    <div className="flex flex-col h-full">
                        <div className="flex justify-between mb-4">
                            <h3 className="text-white font-bold">Organization Directory</h3>
                            <button onClick={() => setShowOrgModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold">
                                <Building2 className="w-4 h-4" /> New Tenant
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
                            {organizations.map(org => (
                                <div key={org.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl hover:border-indigo-500/30 transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-white text-lg">{org.name}</h4>
                                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded border border-indigo-500/20">{org.subscriptionStatus}</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 font-mono mb-4">ID: {org.id}</p>
                                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                                        <Clock className="w-3 h-3" /> Created: {new Date(org.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ADD USER MODAL */}
            {isUserModalOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-zinc-950 border border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4">Manage User</h3>
                        <div className="space-y-4">
                            <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white" placeholder="Full Name" />
                            <input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white" placeholder="Email" />
                            <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white">
                                <option value="User">User</option>
                                <option value="Admin">Admin</option>
                                <option value="Viewer">Viewer</option>
                            </select>
                            {/* Module Permissions */}
                            <div className="space-y-2">
                                <label className="text-xs text-zinc-500 font-bold uppercase">Permissions</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {MODULES_LIST.map(m => (
                                        <button 
                                            key={m.id}
                                            onClick={() => toggleModulePermission(m.id)}
                                            className={`text-xs p-2 rounded border text-left ${formData.allowedModules?.includes(m.id) ? 'bg-indigo-900/30 border-indigo-500 text-indigo-200' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setIsUserModalOpen(false)} className="flex-1 py-3 bg-zinc-800 text-white rounded-xl">Cancel</button>
                                <button onClick={handleSaveUser} disabled={isSaving} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold">
                                    {isSaving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CREATE TENANT MODAL */}
            {showOrgModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-zinc-950 border border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4">Provision New Client</h3>
                        <div className="space-y-4">
                            <input value={newOrgName} onChange={e => setNewOrgName(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white" placeholder="Company Name" />
                            <input value={newOrgAdminName} onChange={e => setNewOrgAdminName(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white" placeholder="Admin Name" />
                            <input value={newOrgAdminEmail} onChange={e => setNewOrgAdminEmail(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white" placeholder="Admin Email" />
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setShowOrgModal(false)} className="flex-1 py-3 bg-zinc-800 text-white rounded-xl">Cancel</button>
                                <button onClick={handleCreateTenant} disabled={isSaving} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold">
                                    {isSaving ? 'Provisioning...' : 'Create Tenant'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
