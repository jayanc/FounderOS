
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { TimesheetEntry, ViewState } from '../types';
import { parseTimesheet, queryTimesheetData } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { Upload, FileSpreadsheet, Download, Search, Loader2, Save, Trash2, Clock, CalendarDays, Plus, BarChart3, User, Folder, Layers, Pencil, Check, X, History, FileJson, Filter, Replace, ArrowRight, AlertTriangle, FileWarning, ArrowUpDown, Sparkles, MoreHorizontal, Eraser, CheckSquare, Square, Camera } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, PieChart, Pie, Legend } from 'recharts';
import * as XLSX from 'xlsx';

// Helper for date formatting
const formatDate = (dateStr: string) => {
    try {
        return new Date(dateStr).toISOString().split('T')[0];
    } catch { return dateStr; }
};

interface TimesheetModuleProps {
    onOpenCapture?: () => void;
}

export const TimesheetModule: React.FC<TimesheetModuleProps> = ({ onOpenCapture }) => {
    // --- Data State ---
    const [entries, setEntries] = useState<TimesheetEntry[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    // --- View State ---
    const [isParsing, setIsParsing] = useState(false);
    const [query, setQuery] = useState('');
    const [report, setReport] = useState('');
    const [isQuerying, setIsQuerying] = useState(false);
    const [groupBy, setGroupBy] = useState<'None' | 'Project' | 'Employee' | 'Month' | 'Source'>('None');
    const [isEditMode, setIsEditMode] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [historyLogs, setHistoryLogs] = useState(storageService.getHistory(ViewState.TIMESHEETS));
    const [showManageFiles, setShowManageFiles] = useState(false);
    
    // --- Search/Replace & Sorting ---
    const [showSearchReplace, setShowSearchReplace] = useState(false);
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [searchField, setSearchField] = useState<keyof TimesheetEntry>('project');
    const [sortConfig, setSortConfig] = useState<{ key: keyof TimesheetEntry, direction: 'asc' | 'desc' } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Load
    useEffect(() => {
        const load = async () => {
            const data = await storageService.load<TimesheetEntry>('founder_os_timesheets'); 
            if (data) setEntries(data);
        };
        load();
    }, []);

    // Save on Change
    useEffect(() => {
        storageService.save('founder_os_timesheets', entries);
    }, [entries]);

    const refreshHistory = () => {
        setHistoryLogs(storageService.getHistory(ViewState.TIMESHEETS));
    };

    // --- Computed Data ---

    const uniqueFiles = useMemo(() => {
        const files = new Set<string>();
        entries.forEach(e => { if(e.sourceFile) files.add(e.sourceFile); });
        return Array.from(files);
    }, [entries]);

    const processedEntries = useMemo(() => {
        let processed = [...entries];

        // Sorting
        if (sortConfig) {
            processed.sort((a, b) => {
                const aVal = a[sortConfig.key] || '';
                const bVal = b[sortConfig.key] || '';
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return processed;
    }, [entries, sortConfig]);

    const groupedEntries = useMemo(() => {
        if (groupBy === 'None') return { 'All Entries': processedEntries };

        return processedEntries.reduce((groups, entry) => {
            let key = '';
            if (groupBy === 'Project') key = entry.project || 'Unassigned';
            else if (groupBy === 'Employee') key = entry.employee || 'Unknown';
            else if (groupBy === 'Month') key = entry.date ? entry.date.substring(0, 7) : 'No Date';
            else if (groupBy === 'Source') key = entry.sourceFile || 'Manual Entry';
            
            if (!groups[key]) groups[key] = [];
            groups[key].push(entry);
            return groups;
        }, {} as Record<string, TimesheetEntry[]>);
    }, [processedEntries, groupBy]);

    // --- Stats for Charts ---
    const chartData = useMemo(() => {
        const projectCounts: Record<string, number> = {};
        const employeeCounts: Record<string, number> = {};
        const timeline: Record<string, number> = {};

        entries.forEach(e => {
            const hrs = Number(e.hours) || 0;
            projectCounts[e.project || 'Unassigned'] = (projectCounts[e.project || 'Unassigned'] || 0) + hrs;
            employeeCounts[e.employee || 'Unknown'] = (employeeCounts[e.employee || 'Unknown'] || 0) + hrs;
            const date = e.date ? e.date.substring(0, 10) : 'Unknown';
            timeline[date] = (timeline[date] || 0) + hrs;
        });

        return {
            projects: Object.entries(projectCounts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value),
            employees: Object.entries(employeeCounts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value),
            timeline: Object.entries(timeline).map(([name, value]) => ({ name, value })).sort((a,b) => new Date(a.name).getTime() - new Date(b.name).getTime())
        };
    }, [entries]);

    // --- Actions: Import ---

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Duplicate File Check
        const isDuplicateFile = entries.some(e => e.sourceFile === file.name);
        if (isDuplicateFile) {
            const confirm = window.confirm(`File "${file.name}" appears to have been uploaded before. Process anyway?`);
            if (!confirm) {
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }
        }

        setIsParsing(true);
        try {
            let newEntries: TimesheetEntry[] = [];
            
            if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer);
                const sheetName = workbook.SheetNames[0];
                const rawJson = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                newEntries = await parseTimesheet(rawJson, 'application/json');
            } else {
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64 = (reader.result as string).split(',')[1];
                    newEntries = await parseTimesheet(base64, file.type);
                    finalizeImport(newEntries, file.name);
                };
                reader.readAsDataURL(file);
                return;
            }
            finalizeImport(newEntries, file.name);
        } catch (err) {
            alert("Failed to parse timesheet. Ensure file is readable.");
            console.error(err);
        } finally {
            setIsParsing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const finalizeImport = (newEntries: TimesheetEntry[], filename: string) => {
        const stamped = newEntries.map(e => ({ ...e, sourceFile: filename }));
        setEntries(prev => [...stamped, ...prev]);
        storageService.logActivity(ViewState.TIMESHEETS, 'IMPORT', `Imported ${newEntries.length} entries from ${filename}`);
        refreshHistory();
    };

    // --- Actions: Cleaning & Management ---

    const handleSort = (key: keyof TimesheetEntry) => {
        setSortConfig(curr => ({
            key,
            direction: curr?.key === key && curr.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const selectAll = () => {
        if (selectedIds.size === entries.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(entries.map(e => e.id)));
    };

    const deleteSelected = () => {
        if (!window.confirm(`Delete ${selectedIds.size} records?`)) return;
        setEntries(prev => prev.filter(e => !selectedIds.has(e.id)));
        setSelectedIds(new Set());
        storageService.logActivity(ViewState.TIMESHEETS, 'DELETE', `Bulk deleted ${selectedIds.size} records`);
    };

    const removeZeroHours = () => {
        const initialCount = entries.length;
        const cleaned = entries.filter(e => Number(e.hours) > 0);
        const removed = initialCount - cleaned.length;
        if (removed === 0) { alert("No zero-hour entries found."); return; }
        
        if (window.confirm(`Found ${removed} entries with 0 hours. Remove them?`)) {
            setEntries(cleaned);
            storageService.logActivity(ViewState.TIMESHEETS, 'DELETE', `Cleaned ${removed} zero-hour entries`);
        }
    };

    const removeDuplicates = () => {
        // Definition of duplicate: Same Date, Employee, Project, Task, Hours
        const seen = new Set<string>();
        const uniqueEntries: TimesheetEntry[] = [];
        let duplicatesCount = 0;

        entries.forEach(e => {
            const signature = `${formatDate(e.date)}|${e.employee}|${e.project}|${e.task}|${e.hours}`;
            if (seen.has(signature)) {
                duplicatesCount++;
            } else {
                seen.add(signature);
                uniqueEntries.push(e);
            }
        });

        if (duplicatesCount === 0) { alert("No exact duplicates found."); return; }

        if (window.confirm(`Found ${duplicatesCount} exact duplicates. Remove them?`)) {
            setEntries(uniqueEntries);
            storageService.logActivity(ViewState.TIMESHEETS, 'DELETE', `Removed ${duplicatesCount} duplicates`);
        }
    };

    const deleteBySourceFile = (filename: string) => {
        if (!window.confirm(`Delete ALL entries imported from "${filename}"?`)) return;
        setEntries(prev => prev.filter(e => e.sourceFile !== filename));
        storageService.logActivity(ViewState.TIMESHEETS, 'DELETE', `Deleted import: ${filename}`);
    };

    const handleSearchReplace = () => {
        let count = 0;
        const newEntries = entries.map(e => {
            const val = e[searchField];
            // Handle "Replace Empty" scenario
            if (findText === "" && !val) {
                 count++;
                 return { ...e, [searchField]: replaceText, status: 'Validated' as const };
            }
            // Normal Replace
            if (findText !== "" && String(val || '').includes(findText)) {
                count++;
                return { ...e, [searchField]: String(val).replace(new RegExp(findText, 'g'), replaceText), status: 'Validated' as const };
            }
            return e;
        });

        if (count > 0) {
            setEntries(newEntries);
            alert(`Updated ${count} entries.`);
            setFindText('');
            setReplaceText('');
        } else {
            alert("No matches found.");
        }
    };

    const updateEntry = (id: string, field: keyof TimesheetEntry, value: any) => {
        setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value, status: 'Validated' } : e));
    };

    // --- AI Query ---
    const handleGenerateReport = async () => {
        if (!query) return;
        setIsQuerying(true);
        try {
            const result = await queryTimesheetData(entries, query);
            setReport(result);
        } catch (e) {
            setReport("Error generating report.");
        } finally {
            setIsQuerying(false);
        }
    };

    // --- Export ---
    const handleExport = (format: 'csv' | 'json', subset?: TimesheetEntry[]) => {
        const dataToExport = subset || entries;
        const filename = `Timesheet_Export_${new Date().toISOString().split('T')[0]}`;

        if (format === 'csv') {
            const worksheet = XLSX.utils.json_to_sheet(dataToExport.map(({id, ...rest}) => rest));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Timesheets");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        } else {
            const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.json`;
            a.click();
        }
        storageService.logActivity(ViewState.TIMESHEETS, 'EXPORT', `Exported ${dataToExport.length} entries`);
    };

    const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];

    return (
        <div className="flex flex-col h-full gap-8 relative">
            <header className="flex justify-between items-end border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Timesheet Intelligence</h2>
                    <p className="text-zinc-400 mt-2 font-light">Import, Clean, Validate, and Analyze workforce data.</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowHistory(!showHistory)} 
                        className={`p-2.5 rounded-xl border transition-colors ${showHistory ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-transparent border-transparent text-zinc-500 hover:text-white'}`}
                        title="View History"
                    >
                        <History className="w-5 h-5" />
                    </button>
                    
                    <div className="h-10 w-px bg-white/10 mx-1"></div>

                    <button onClick={() => setShowSearchReplace(!showSearchReplace)} className={`p-2.5 rounded-xl border transition-colors ${showSearchReplace ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-transparent border-zinc-800 text-zinc-400 hover:text-white'}`} title="Find & Replace"><Replace className="w-5 h-5"/></button>

                    <button onClick={() => setShowManageFiles(true)} className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-xl hover:text-white flex items-center gap-2 text-sm transition-colors">
                        <Layers className="w-4 h-4" /> Manage Imports
                    </button>
                    
                    {onOpenCapture && (
                        <button onClick={onOpenCapture} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors bg-zinc-900" title="Capture Snapshot">
                            <Camera className="w-5 h-5" />
                        </button>
                    )}

                    <button onClick={() => fileInputRef.current?.click()} disabled={isParsing} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all">
                        {isParsing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4" />}
                        Import Data
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx,.xls,.pdf,.jpg,.png" onChange={handleFileUpload} />
                </div>
            </header>

            {/* SEARCH & REPLACE TOOLBAR */}
            {showSearchReplace && (
                <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl flex flex-wrap items-center gap-4 animate-in slide-in-from-top-2 shadow-xl">
                    <span className="text-sm font-bold text-white flex items-center gap-2"><Replace className="w-4 h-4" /> Bulk Edit</span>
                    <select 
                        value={searchField} 
                        onChange={(e) => setSearchField(e.target.value as keyof TimesheetEntry)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm text-white focus:border-indigo-500 outline-none"
                    >
                        <option value="project">Project</option>
                        <option value="employee">Employee</option>
                        <option value="task">Task</option>
                        <option value="notes">Notes</option>
                    </select>
                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5">
                        <Search className="w-3 h-3 text-zinc-500" />
                        <input value={findText} onChange={e => setFindText(e.target.value)} placeholder="Value (leave empty for null)..." className="bg-transparent text-sm text-white focus:outline-none w-48" />
                    </div>
                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5">
                        <ArrowRight className="w-3 h-3 text-zinc-500" />
                        <input value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="Replace with..." className="bg-transparent text-sm text-white focus:outline-none w-48" />
                    </div>
                    <button onClick={handleSearchReplace} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">Apply</button>
                    <button onClick={() => setShowSearchReplace(false)} className="text-zinc-500 hover:text-white ml-auto"><X className="w-4 h-4"/></button>
                </div>
            )}

            {/* MANAGE FILES MODAL */}
            {showManageFiles && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                     <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl">
                         <div className="flex justify-between items-center mb-6">
                             <h3 className="text-lg font-bold text-white">Manage Source Files</h3>
                             <button onClick={() => setShowManageFiles(false)}><X className="w-5 h-5 text-zinc-500 hover:text-white"/></button>
                         </div>
                         <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                             {uniqueFiles.length === 0 ? <p className="text-zinc-500 text-sm italic">No files imported yet.</p> : 
                                uniqueFiles.map(file => {
                                    const count = entries.filter(e => e.sourceFile === file).length;
                                    return (
                                        <div key={file} className="flex justify-between items-center p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                                            <div className="flex items-center gap-3">
                                                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                                                <div>
                                                    <p className="text-sm text-white font-medium truncate max-w-[200px]" title={file}>{file || 'Manual Entry'}</p>
                                                    <p className="text-xs text-zinc-500">{count} entries</p>
                                                </div>
                                            </div>
                                            <button onClick={() => deleteBySourceFile(file || '')} className="text-xs text-rose-400 hover:bg-rose-500/10 px-3 py-1.5 rounded-lg transition-colors border border-rose-500/20">
                                                Delete All
                                            </button>
                                        </div>
                                    )
                                })
                             }
                         </div>
                     </div>
                 </div>
            )}

            {/* DASHBOARD GRID */}
            {entries.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-64 shrink-0 animate-in fade-in slide-in-from-bottom-4">
                    {/* 1. Timeline Area Chart */}
                    <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 flex flex-col relative overflow-hidden">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 z-10">Workforce Velocity (Hrs)</h4>
                        <div className="flex-1 -ml-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData.timeline}>
                                    <defs>
                                        <linearGradient id="colorHrs" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="name" hide />
                                    <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px'}} />
                                    <Area type="monotone" dataKey="value" stroke="#6366f1" fillOpacity={1} fill="url(#colorHrs)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* 2. Project Distribution */}
                    <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 flex flex-col relative">
                         <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 z-10">Project Allocation</h4>
                         <div className="flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={chartData.projects} innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                                        {chartData.projects.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px'}} />
                                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize:'10px', color:'#a1a1aa'}} />
                                </PieChart>
                            </ResponsiveContainer>
                         </div>
                    </div>

                    {/* 3. Top Employees */}
                    <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 flex flex-col relative">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 z-10">Top Contributors</h4>
                         <div className="flex-1 -ml-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData.employees.slice(0, 5)} layout="vertical">
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fill: '#a1a1aa'}} />
                                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px'}} />
                                    <Bar dataKey="value" fill="#10b981" radius={[0,4,4,0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                         </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-8 h-full min-h-0 relative">
                
                {/* History Drawer */}
                {showHistory && (
                    <div className="absolute top-0 right-0 z-20 w-80 h-full bg-zinc-950/95 backdrop-blur-xl border-l border-white/10 shadow-2xl p-6 animate-in slide-in-from-right-4 duration-300 overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-white font-bold flex items-center gap-2"><History className="w-4 h-4 text-indigo-400"/> Activity Log</h3>
                            <button onClick={() => setShowHistory(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4"/></button>
                        </div>
                        <div className="space-y-6 relative border-l border-zinc-800 ml-2">
                            {historyLogs.map(log => (
                                <div key={log.id} className="ml-6 relative">
                                    <div className={`absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${log.action === 'IMPORT' ? 'bg-emerald-500' : log.action === 'DELETE' ? 'bg-rose-500' : 'bg-indigo-500'}`} />
                                    <p className="text-xs text-zinc-500 font-mono mb-1">{new Date(log.timestamp).toLocaleString()}</p>
                                    <p className="text-sm text-zinc-300 font-medium">{log.action}</p>
                                    <p className="text-xs text-zinc-400 mt-1">{log.details}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main Content */}
                <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                    
                    {/* Table Container */}
                    <div className="flex-1 bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl flex flex-col shadow-2xl overflow-hidden">
                        
                        {/* Toolbar */}
                        <div className="p-4 bg-white/5 border-b border-white/5 flex flex-wrap gap-4 justify-between items-center">
                             <div className="flex items-center gap-4">
                                 <div className="flex items-center gap-2 text-zinc-400">
                                     <FileSpreadsheet className="w-4 h-4" />
                                     <span className="text-sm font-medium">{entries.length} Records</span>
                                 </div>
                                 <div className="h-4 w-px bg-white/10"></div>
                                 
                                 {/* Cleanup Tools Dropdown */}
                                 <div className="flex items-center gap-2 group relative">
                                    <button className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors bg-black/30 px-3 py-1.5 rounded-lg border border-zinc-800">
                                        <Eraser className="w-3 h-3" /> Cleanup Tools
                                    </button>
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl p-1 hidden group-hover:block z-20">
                                        <button onClick={removeDuplicates} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 rounded-lg flex items-center gap-2">
                                            <FileWarning className="w-3 h-3 text-amber-500" /> Remove Duplicates
                                        </button>
                                        <button onClick={removeZeroHours} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 rounded-lg flex items-center gap-2">
                                            <Trash2 className="w-3 h-3 text-rose-500" /> Remove Zero Hours
                                        </button>
                                    </div>
                                 </div>

                                 <div className="flex items-center gap-2">
                                     <span className="text-xs text-zinc-500 uppercase font-bold">Group By:</span>
                                     <div className="flex bg-black/30 rounded-lg p-0.5 border border-zinc-800">
                                         {['None', 'Project', 'Employee', 'Month', 'Source'].map(g => (
                                             <button 
                                                key={g} 
                                                onClick={() => setGroupBy(g as any)}
                                                className={`px-3 py-1 text-xs rounded-md transition-all ${groupBy === g ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                                             >
                                                 {g}
                                             </button>
                                         ))}
                                     </div>
                                 </div>
                             </div>
                             
                             <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => setIsEditMode(!isEditMode)} 
                                    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${isEditMode ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-white'}`}
                                >
                                    <Pencil className="w-3 h-3" /> {isEditMode ? 'Done' : 'Edit Mode'}
                                </button>
                                <button onClick={() => handleExport('csv')} className="p-1.5 text-zinc-400 hover:text-white transition-colors"><Download className="w-4 h-4"/></button>
                             </div>
                        </div>

                        {/* Floating Action Bar for Selection */}
                        {selectedIds.size > 0 && (
                            <div className="bg-indigo-600 text-white p-3 flex justify-between items-center animate-in slide-in-from-top-0">
                                <div className="flex items-center gap-3 text-sm font-medium px-2">
                                    <CheckSquare className="w-4 h-4" />
                                    {selectedIds.size} Selected
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={deleteSelected} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium flex items-center gap-2">
                                        <Trash2 className="w-3 h-3" /> Delete
                                    </button>
                                    <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 hover:bg-white/10 rounded-lg text-xs">Cancel</button>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-auto custom-scrollbar p-4 relative">
                            {entries.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-zinc-500 italic gap-3">
                                    <FileSpreadsheet className="w-16 h-16 opacity-20" />
                                    <p>No timesheets loaded. Upload Excel, CSV, or PDF to begin.</p>
                                </div>
                            ) : (
                                Object.entries(groupedEntries).map(([group, rawGroupEntries]) => {
                                    const groupEntries = rawGroupEntries as TimesheetEntry[];
                                    return (
                                    <div key={group} className="mb-8 last:mb-0">
                                        {groupBy !== 'None' && (
                                            <div className="flex justify-between items-center mb-3 sticky top-0 bg-zinc-900/90 backdrop-blur-sm z-10 py-2 border-b border-white/5">
                                                <div className="flex items-center gap-2">
                                                    {groupBy === 'Project' ? <Folder className="w-4 h-4 text-indigo-400"/> : groupBy === 'Source' ? <FileJson className="w-4 h-4 text-zinc-400"/> : <User className="w-4 h-4 text-purple-400"/>}
                                                    <h3 className="text-sm font-bold text-white max-w-xs truncate" title={group}>{group}</h3>
                                                    <span className="text-xs text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full">{groupEntries.length} items</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-xs text-zinc-400">Total: <span className="text-white font-mono font-bold">{groupEntries.reduce((a,b) => a + (Number(b.hours)||0), 0).toFixed(1)} hrs</span></span>
                                                </div>
                                            </div>
                                        )}

                                        <table className="w-full text-left text-sm text-zinc-400 border-collapse">
                                            <thead className="bg-zinc-950/50 text-xs uppercase tracking-wider text-zinc-500">
                                                <tr>
                                                    <th className="p-3 border-b border-zinc-800 w-10 text-center">
                                                        <button onClick={selectAll} className="hover:text-white"><Square className="w-4 h-4"/></button>
                                                    </th>
                                                    <th className="p-3 border-b border-zinc-800 w-32 cursor-pointer hover:text-white" onClick={() => handleSort('date')}>Date <ArrowUpDown className="w-3 h-3 inline opacity-50"/></th>
                                                    <th className="p-3 border-b border-zinc-800 w-48 cursor-pointer hover:text-white" onClick={() => handleSort('employee')}>Employee <ArrowUpDown className="w-3 h-3 inline opacity-50"/></th>
                                                    <th className="p-3 border-b border-zinc-800 w-48 cursor-pointer hover:text-white" onClick={() => handleSort('project')}>Project <ArrowUpDown className="w-3 h-3 inline opacity-50"/></th>
                                                    <th className="p-3 border-b border-zinc-800">Task</th>
                                                    <th className="p-3 border-b border-zinc-800 text-right w-24 cursor-pointer hover:text-white" onClick={() => handleSort('hours')}>Hours <ArrowUpDown className="w-3 h-3 inline opacity-50"/></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {groupEntries.map(e => (
                                                    <tr 
                                                        key={e.id} 
                                                        className={`hover:bg-white/5 group transition-colors ${selectedIds.has(e.id) ? 'bg-indigo-500/10' : ''} ${Number(e.hours) === 0 ? 'opacity-50' : ''}`}
                                                    >
                                                        <td className="p-3 text-center">
                                                            <button onClick={() => toggleSelection(e.id)} className={selectedIds.has(e.id) ? 'text-indigo-400' : 'text-zinc-700 hover:text-zinc-500'}>
                                                                {selectedIds.has(e.id) ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                                                            </button>
                                                        </td>
                                                        <td className="p-3 font-mono text-zinc-300 whitespace-nowrap">
                                                            {isEditMode ? (
                                                                <input type="date" value={formatDate(e.date)} onChange={(ev) => updateEntry(e.id, 'date', ev.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white w-full" />
                                                            ) : e.date}
                                                        </td>
                                                        <td className="p-3 text-white font-medium">
                                                            {isEditMode ? (
                                                                <input type="text" value={e.employee} onChange={(ev) => updateEntry(e.id, 'employee', ev.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white w-full" />
                                                            ) : (
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[9px] text-zinc-400">{e.employee?.charAt(0)}</div>
                                                                    {e.employee}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="p-3">
                                                            {isEditMode ? (
                                                                <input type="text" value={e.project} onChange={(ev) => updateEntry(e.id, 'project', ev.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white w-full" />
                                                            ) : <span className="bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20 text-xs font-medium">{e.project}</span>}
                                                        </td>
                                                        <td className="p-3 text-zinc-400 max-w-xs truncate">
                                                            {isEditMode ? (
                                                                <input type="text" value={e.task} onChange={(ev) => updateEntry(e.id, 'task', ev.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white w-full" />
                                                            ) : e.task}
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-white font-bold">
                                                            {isEditMode ? (
                                                                <input type="number" value={e.hours} onChange={(ev) => updateEntry(e.id, 'hours', parseFloat(ev.target.value))} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white w-20 text-right" />
                                                            ) : Number(e.hours).toFixed(1)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* AI Query Sidebar */}
                <div className="w-full lg:w-80 bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 flex flex-col gap-4 shadow-xl">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2"><Search className="w-5 h-5 text-indigo-400"/> AI Analyst</h3>
                        <p className="text-xs text-zinc-400 mt-1">Ask questions about your workforce data.</p>
                    </div>

                    <div className="flex-1 bg-black/20 rounded-xl p-4 border border-white/5 overflow-y-auto">
                        {report ? (
                            <div className="prose prose-invert prose-sm">
                                <p className="text-zinc-300 whitespace-pre-wrap">{report}</p>
                            </div>
                        ) : (
                            <div className="text-center text-zinc-600 text-sm mt-10">
                                Results will appear here...
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <textarea 
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="e.g. Total hours by Project X? Who worked the most last week?"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 pr-12 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none h-24"
                        />
                        <button 
                            onClick={handleGenerateReport}
                            disabled={isQuerying || !query}
                            className="absolute bottom-3 right-3 p-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white disabled:opacity-50 transition-colors"
                        >
                            {isQuerying ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
