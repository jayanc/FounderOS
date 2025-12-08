
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { TimesheetEntry, ViewState } from '../types';
import { parseTimesheet, queryTimesheetData } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { Upload, FileSpreadsheet, Download, Search, Loader2, Save, Trash2, Clock, CalendarDays, Plus, BarChart3, User, Folder, Layers, Pencil, Check, X, History, FileJson, Filter, Replace, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import * as XLSX from 'xlsx';

// Helper for date formatting
const formatDate = (dateStr: string) => {
    try {
        return new Date(dateStr).toISOString().split('T')[0];
    } catch { return dateStr; }
};

export const TimesheetModule: React.FC = () => {
    const [entries, setEntries] = useState<TimesheetEntry[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [query, setQuery] = useState('');
    const [report, setReport] = useState('');
    const [isQuerying, setIsQuerying] = useState(false);
    
    // Grouping State
    const [groupBy, setGroupBy] = useState<'None' | 'Project' | 'Employee' | 'Month'>('None');
    
    // Edit State
    const [isEditMode, setIsEditMode] = useState(false);
    
    // History Panel
    const [showHistory, setShowHistory] = useState(false);
    const [historyLogs, setHistoryLogs] = useState(storageService.getHistory(ViewState.TIMESHEETS));

    // Search Replace
    const [showSearchReplace, setShowSearchReplace] = useState(false);
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [searchField, setSearchField] = useState<keyof TimesheetEntry>('project');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Load
    useEffect(() => {
        const load = async () => {
            const data = await storageService.load<TimesheetEntry>('founder_os_timesheets'); // Using specific key convention
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

    // --- Stats Calculation ---
    const totalHours = entries.reduce((acc, e) => acc + (Number(e.hours) || 0), 0);
    const topProject = useMemo(() => {
        const counts: Record<string, number> = {};
        entries.forEach(e => counts[e.project] = (counts[e.project] || 0) + (Number(e.hours) || 0));
        // Explicitly type the fallback tuple to match Object.entries return type [string, number]
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || (['-', 0] as [string, number]);
    }, [entries]);

    const chartData = useMemo(() => {
        const counts: Record<string, number> = {};
        entries.forEach(e => counts[e.project] = (counts[e.project] || 0) + (Number(e.hours) || 0));
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [entries]);

    // --- Grouping Logic ---
    const groupedEntries = useMemo(() => {
        if (groupBy === 'None') return { 'All Entries': entries };

        return entries.reduce((groups, entry) => {
            let key = '';
            if (groupBy === 'Project') key = entry.project || 'Unassigned';
            else if (groupBy === 'Employee') key = entry.employee || 'Unknown';
            else if (groupBy === 'Month') key = entry.date ? entry.date.substring(0, 7) : 'No Date';
            
            if (!groups[key]) groups[key] = [];
            groups[key].push(entry);
            return groups;
        }, {} as Record<string, TimesheetEntry[]>);
    }, [entries, groupBy]);

    // --- Actions ---

    const handleSearchReplace = () => {
        if (!findText) return;
        let count = 0;
        const newEntries = entries.map(e => {
            const val = String(e[searchField] || '');
            if (val.includes(findText)) {
                count++;
                return { ...e, [searchField]: val.replace(new RegExp(findText, 'g'), replaceText), status: 'Validated' as const };
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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsParsing(true);
        try {
            let newEntries: TimesheetEntry[] = [];
            // Excel Handling via XLSX
            if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer);
                const sheetName = workbook.SheetNames[0];
                const rawJson = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                
                newEntries = await parseTimesheet(rawJson, 'application/json');
            } else {
                // Image/PDF Handling
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64 = (reader.result as string).split(',')[1];
                    newEntries = await parseTimesheet(base64, file.type);
                    finalizeImport(newEntries, file.name);
                };
                reader.readAsDataURL(file);
                return; // Early return for async reader
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
        setEntries(prev => [...newEntries, ...prev]);
        storageService.logActivity(ViewState.TIMESHEETS, 'IMPORT', `Imported ${newEntries.length} entries from ${filename}`);
        refreshHistory();
    };

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

    const handleExport = (format: 'csv' | 'json', subset?: TimesheetEntry[]) => {
        const dataToExport = subset || entries;
        const filename = `Timesheet_Export_${new Date().toISOString().split('T')[0]}`;

        if (format === 'csv') {
            const worksheet = XLSX.utils.json_to_sheet(dataToExport.map(({id, sourceFile, ...rest}) => rest)); // Exclude internal IDs
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
        
        storageService.logActivity(ViewState.TIMESHEETS, 'EXPORT', `Exported ${dataToExport.length} entries to ${format.toUpperCase()}`);
        refreshHistory();
    };

    const deleteEntry = (id: string) => {
        setEntries(prev => prev.filter(e => e.id !== id));
        storageService.logActivity(ViewState.TIMESHEETS, 'DELETE', 'Deleted entry');
        refreshHistory();
    };

    const updateEntry = (id: string, field: keyof TimesheetEntry, value: any) => {
        setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value, status: 'Validated' } : e));
    };

    return (
        <div className="flex flex-col h-full gap-8 relative">
            <header className="flex justify-between items-end border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Timesheet Intelligence</h2>
                    <p className="text-zinc-400 mt-2 font-light">Import Excel/PDF, Group, Validate, and Analyze.</p>
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

                    <button onClick={() => setShowSearchReplace(!showSearchReplace)} className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors" title="Find & Replace"><Replace className="w-5 h-5"/></button>

                    <button onClick={() => handleExport('csv')} className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-xl hover:text-white flex items-center gap-2 text-sm transition-colors">
                        <Download className="w-4 h-4" /> Export All
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} disabled={isParsing} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all">
                        {isParsing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4" />}
                        Import Excel / PDF
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx,.xls,.pdf,.jpg,.png" onChange={handleFileUpload} />
                </div>
            </header>

            {/* SEARCH AND REPLACE TOOLBAR */}
            {showSearchReplace && (
                <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl flex flex-wrap items-center gap-4 animate-in slide-in-from-top-2">
                    <span className="text-sm font-bold text-white flex items-center gap-2"><Replace className="w-4 h-4" /> Find & Replace in Timesheets</span>
                    <select 
                        value={searchField} 
                        onChange={(e) => setSearchField(e.target.value as keyof TimesheetEntry)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm text-white"
                    >
                        <option value="project">Project</option>
                        <option value="employee">Employee</option>
                        <option value="task">Task</option>
                    </select>
                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5">
                        <Search className="w-3 h-3 text-zinc-500" />
                        <input value={findText} onChange={e => setFindText(e.target.value)} placeholder="Find..." className="bg-transparent text-sm text-white focus:outline-none w-32" />
                    </div>
                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5">
                        <ArrowRight className="w-3 h-3 text-zinc-500" />
                        <input value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="Replace with..." className="bg-transparent text-sm text-white focus:outline-none w-32" />
                    </div>
                    <button onClick={handleSearchReplace} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">Apply Replace</button>
                    <button onClick={() => setShowSearchReplace(false)} className="text-zinc-500 hover:text-white ml-auto"><X className="w-4 h-4"/></button>
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
                            {historyLogs.length === 0 && <p className="ml-6 text-zinc-600 text-sm">No recent activity.</p>}
                        </div>
                    </div>
                )}

                {/* Main Content */}
                <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                    
                    {/* Dashboard Stats */}
                    {entries.length > 0 && (
                        <div className="grid grid-cols-3 gap-4 h-40 shrink-0">
                            <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
                                <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Total Hours Logged</span>
                                <div className="flex items-center gap-3">
                                    <div className="bg-emerald-500/10 p-2 rounded-lg"><Clock className="w-6 h-6 text-emerald-400"/></div>
                                    <span className="text-3xl font-bold text-white font-mono">{totalHours.toFixed(1)}</span>
                                </div>
                            </div>
                            <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
                                <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Top Project</span>
                                <div className="flex items-center gap-3">
                                    <div className="bg-indigo-500/10 p-2 rounded-lg"><BarChart3 className="w-6 h-6 text-indigo-400"/></div>
                                    <div>
                                        <p className="text-white font-bold leading-tight line-clamp-1">{topProject[0]}</p>
                                        <p className="text-xs text-zinc-400">{topProject[1].toFixed(1)} Hours</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 relative overflow-hidden">
                                <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider block mb-2">Project Distribution</span>
                                <div className="h-24 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData.slice(0, 5)}>
                                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px'}} />
                                            <Bar dataKey="value" fill="#6366f1" radius={[4,4,0,0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Table / Grid */}
                    <div className="flex-1 bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl flex flex-col shadow-2xl overflow-hidden">
                        
                        {/* Table Toolbar */}
                        <div className="p-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
                             <div className="flex items-center gap-4">
                                 <div className="flex items-center gap-2 text-zinc-400">
                                     <FileSpreadsheet className="w-4 h-4" />
                                     <span className="text-sm font-medium">{entries.length} Rows</span>
                                 </div>
                                 <div className="h-4 w-px bg-white/10"></div>
                                 <div className="flex items-center gap-2">
                                     <span className="text-xs text-zinc-500 uppercase font-bold">Group By:</span>
                                     <div className="flex bg-black/30 rounded-lg p-0.5 border border-zinc-800">
                                         {['None', 'Project', 'Employee', 'Month'].map(g => (
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
                             
                             <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-500 mr-2 flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500" /> Processed Locally</span>
                                <button 
                                    onClick={() => setIsEditMode(!isEditMode)} 
                                    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${isEditMode ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-white'}`}
                                >
                                    <Pencil className="w-3 h-3" /> {isEditMode ? 'Done Editing' : 'Edit Mode'}
                                </button>
                             </div>
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar p-4">
                            {Object.entries(groupedEntries).map(([group, groupEntries]) => (
                                <div key={group} className="mb-8 last:mb-0">
                                    {groupBy !== 'None' && (
                                        <div className="flex justify-between items-center mb-3 sticky top-0 bg-zinc-900/90 backdrop-blur-sm z-10 py-2 border-b border-white/5">
                                            <div className="flex items-center gap-2">
                                                {groupBy === 'Project' ? <Folder className="w-4 h-4 text-indigo-400"/> : groupBy === 'Employee' ? <User className="w-4 h-4 text-purple-400"/> : <CalendarDays className="w-4 h-4 text-emerald-400"/>}
                                                <h3 className="text-sm font-bold text-white">{group}</h3>
                                                <span className="text-xs text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full">{groupEntries.length} items</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-xs text-zinc-400">Total: <span className="text-white font-mono font-bold">{groupEntries.reduce((a,b) => a + (Number(b.hours)||0), 0).toFixed(1)} hrs</span></span>
                                                <button onClick={() => handleExport('json', groupEntries)} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><FileJson className="w-3 h-3"/> Export Group</button>
                                            </div>
                                        </div>
                                    )}

                                    <table className="w-full text-left text-sm text-zinc-400 border-collapse">
                                        <thead className="bg-zinc-950/50 text-xs uppercase tracking-wider text-zinc-500">
                                            <tr>
                                                <th className="p-3 border-b border-zinc-800 w-32">Date</th>
                                                <th className="p-3 border-b border-zinc-800 w-48">Employee</th>
                                                <th className="p-3 border-b border-zinc-800 w-48">Project</th>
                                                <th className="p-3 border-b border-zinc-800">Task</th>
                                                <th className="p-3 border-b border-zinc-800 text-right w-24">Hours</th>
                                                <th className="p-3 border-b border-zinc-800 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {groupEntries.map(e => (
                                                <tr key={e.id} className="hover:bg-white/5 group transition-colors">
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
                                                    <td className="p-3 text-right">
                                                        <button onClick={() => deleteEntry(e.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"><Trash2 className="w-4 h-4"/></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                            {entries.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 text-zinc-500 italic gap-3">
                                    <FileSpreadsheet className="w-12 h-12 opacity-20" />
                                    <p>No timesheets loaded. Upload data to begin.</p>
                                </div>
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
                            {isQuerying ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4"/>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
