
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ReceiptData, IntegrationAccount, BankTransaction, ReconciliationSuggestion, ViewState } from '../types';
import { analyzeReceipt, parseBankStatement, suggestMatches, extractReceiptsFromZip, analyzeReceiptBatch } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { Upload, CheckCircle2, AlertCircle, Loader2, DollarSign, Calendar, FileText, RefreshCw, Plus, X, FileSpreadsheet, FileJson, AlertTriangle, Calculator, Scale, Trash2, Tag, Camera, ClipboardPaste, SlidersHorizontal, ChevronDown, ChevronUp, Eye, EyeOff, Wand2, MessageSquare, Sparkles, ArrowUpDown, Percent, Layers, ListChecks, Zap, Link as LinkIcon, ArrowRight, Download, MoreHorizontal, Table, SplitSquareVertical, ShieldCheck, HelpCircle, Filter, Check, XCircle, MousePointerClick, ExternalLink, Search, Replace, CheckSquare, Square, FileArchive } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import JSZip from 'jszip';

// Helper to guess mime type
const getMimeType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    return 'application/octet-stream';
};

// Helper for file download
const downloadData = (content: string, filename: string, type: 'csv' | 'json') => {
    const mime = type === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};

interface FinanceModuleProps {
  receipts: ReceiptData[];
  onAddReceipt: (receipt: ReceiptData) => void;
  onRemoveReceipt?: (id: string) => void;
  accounts: IntegrationAccount[];
  onOpenCapture: () => void;
}

interface ColumnConfig {
  id: keyof ReceiptData | 'actions' | 'vatAmount' | 'source' | 'link'; 
  label: string;
  visible: boolean;
  sortable: boolean;
  width?: string;
}

const VAT_RATES = [
    { label: '25% (Std)', value: 25 },
    { label: '12% (Food)', value: 12 },
    { label: '6% (Travel)', value: 6 },
    { label: '0%', value: 0 }
];

export const FinanceModule: React.FC<FinanceModuleProps> = ({ receipts, onAddReceipt, onRemoveReceipt, accounts, onOpenCapture }) => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'ledger' | 'reconciliation'>('ledger');
  
  // Ledger
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number} | null>(null); // Progress State
  const [statusText, setStatusText] = useState("Analyzing...");
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzedData, setAnalyzedData] = useState<ReceiptData | null>(null);
  const [showVatCalc, setShowVatCalc] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search & Replace
  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchField, setSearchField] = useState<keyof ReceiptData>('vendor');

  // Table Config
  const [columns, setColumns] = useState<ColumnConfig[]>([
    { id: 'date', label: 'Date', visible: true, sortable: true, width: 'w-32' },
    { id: 'vendor', label: 'Vendor', visible: true, sortable: true, width: 'w-48' },
    { id: 'description', label: 'Description', visible: false, sortable: false, width: 'w-64' },
    { id: 'category', label: 'Category', visible: true, sortable: true, width: 'w-32' },
    { id: 'amount', label: 'Amount', visible: true, sortable: true, width: 'w-32' },
    { id: 'vatAmount', label: 'VAT', visible: true, sortable: true, width: 'w-24' },
    { id: 'source', label: 'Source', visible: true, sortable: true, width: 'w-24' },
    { id: 'link', label: 'File', visible: true, sortable: false, width: 'w-10'},
    { id: 'actions', label: '', visible: true, sortable: false, width: 'w-10' }
  ]);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [showColumnOptions, setShowColumnOptions] = useState(false);

  // Reconciliation
  const [reconcileView, setReconcileView] = useState<'split' | 'unified'>('split');
  const [reconcileFilter, setReconcileFilter] = useState<'all' | 'unmatched' | 'matched'>('unmatched');
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [isMagicMatching, setIsMagicMatching] = useState(false);
  const [matchSuggestions, setMatchSuggestions] = useState<ReconciliationSuggestion[]>([]);
  const [showMatchReview, setShowMatchReview] = useState(false);
  const bankInputRef = useRef<HTMLInputElement>(null);

  // Manual Matching State (Tick Box)
  const [checkedTxIds, setCheckedTxIds] = useState<Set<string>>(new Set());
  const [checkedRcptIds, setCheckedRcptIds] = useState<Set<string>>(new Set());

  // --- MEMOIZED CALCULATIONS ---

  const sortedReceipts = useMemo(() => {
    if (!sortConfig) return receipts;
    return [...receipts].sort((a, b) => {
      const aVal = a[sortConfig.key as keyof ReceiptData];
      const bVal = b[sortConfig.key as keyof ReceiptData];
      if (aVal === undefined || bVal === undefined) return 0;
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [receipts, sortConfig]);

  const chartData = useMemo(() => {
    return receipts.reduce((acc: any[], r) => {
      const existing = acc.find(item => item.name === r.category);
      if (existing) {
        existing.value += r.amount;
      } else {
        acc.push({ name: r.category, value: r.amount });
      }
      return acc;
    }, []);
  }, [receipts]);

  // Reconciliation Stats Calculation
  const reconciliationStats = useMemo(() => {
      let matchedCount = 0;
      let matchedAmount = 0;
      let totalExpenseAmount = 0;
      let missing = 0;
      let exactMatches = 0;
      let aiMatches = 0;
      let manualMatches = 0;

      bankTransactions.forEach(tx => {
          if (tx.status === 'Ignored') return;
          if (tx.amount < 0) totalExpenseAmount += Math.abs(tx.amount);
          
          if (tx.matchedReceiptId) {
              matchedCount++;
              matchedAmount += Math.abs(tx.amount);
              if (tx.matchType === 'Exact') exactMatches++;
              else if (tx.matchType === 'AI') aiMatches++;
              else manualMatches++;
          } else if (tx.amount < 0 && tx.status === 'Unreconciled') {
              missing++;
          }
      });

      return {
          matched: matchedCount,
          missing,
          unreconciled: receipts.length - matchedCount,
          matchedAmount,
          unmatchedAmount: totalExpenseAmount - matchedAmount,
          exactMatches,
          aiMatches,
          manualMatches
      };
  }, [bankTransactions, receipts.length]);

  const unifiedReportData = useMemo(() => {
      const reportData: any[] = [];
      const matchedReceiptIds = new Set<string>();

      // 1. Process Bank Transactions
      bankTransactions.forEach(tx => {
          const match = tx.matchedReceiptId ? receipts.find(r => r.id === tx.matchedReceiptId) : null;
          if (match) matchedReceiptIds.add(match.id);
          
          if (reconcileFilter === 'matched' && !tx.matchedReceiptId) return;
          if (reconcileFilter === 'unmatched' && tx.matchedReceiptId) return;

          reportData.push({
              id: tx.id,
              type: 'BANK',
              status: tx.matchedReceiptId ? 'MATCHED' : (tx.amount < 0 ? 'MISSING_RECEIPT' : 'INCOME'),
              matchType: tx.matchType,
              date: tx.date,
              bankDesc: tx.description,
              bankAmount: tx.amount,
              receiptDate: match?.date || '',
              receiptVendor: match?.vendor || '',
              receiptAmount: match ? (match.amount * -1) : '',
              variance: match ? (Math.abs(tx.amount) - match.amount).toFixed(2) : '',
              notes: tx.aiSuggestion || '',
              sourceUrl: match?.sourceUrl
          });
      });

      // 2. Process Unmatched Receipts
      if (reconcileFilter !== 'matched') {
          receipts.forEach(r => {
              if (!matchedReceiptIds.has(r.id)) {
                  reportData.push({
                      id: r.id,
                      type: 'RECEIPT',
                      status: 'NOT_IN_BANK',
                      date: r.date,
                      bankDesc: '',
                      bankAmount: '',
                      receiptDate: r.date,
                      receiptVendor: r.vendor,
                      receiptAmount: r.amount, 
                      variance: '',
                      notes: 'Logged but not in bank',
                      sourceUrl: r.sourceUrl
                  });
              }
          });
      }
      return reportData.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [bankTransactions, receipts, reconcileFilter]);

  const filteredBankTx = useMemo(() => {
      if (reconcileFilter === 'all') return bankTransactions;
      if (reconcileFilter === 'matched') return bankTransactions.filter(t => t.matchedReceiptId);
      return bankTransactions.filter(t => !t.matchedReceiptId);
  }, [bankTransactions, reconcileFilter]);

  const filteredReceipts = useMemo(() => {
      if (reconcileFilter === 'all') return receipts;
      if (reconcileFilter === 'matched') return receipts.filter(r => bankTransactions.some(t => t.matchedReceiptId === r.id));
      return receipts.filter(r => !bankTransactions.some(t => t.matchedReceiptId === r.id));
  }, [receipts, bankTransactions, reconcileFilter]);

  // --- ACTIONS ---

  const handleSort = useCallback((key: string) => {
    setSortConfig(current => {
      let direction: 'asc' | 'desc' = 'asc';
      if (current && current.key === key && current.direction === 'asc') {
        direction = 'desc';
      }
      return { key, direction };
    });
  }, []);

  const toggleColumn = useCallback((id: string) => {
    setColumns(cols => cols.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  }, []);

  const handleSearchReplace = () => {
      if (!findText) return;
      let count = 0;
      const updatedReceipts: ReceiptData[] = [];
      const idsToRemove: string[] = [];

      receipts.forEach(r => {
          const val = String(r[searchField] || '');
          if (val.includes(findText)) {
              const newVal = val.replace(new RegExp(findText, 'g'), replaceText);
              updatedReceipts.push({ ...r, [searchField]: newVal });
              idsToRemove.push(r.id);
              count++;
          }
      });

      if (count > 0) {
          idsToRemove.forEach(id => onRemoveReceipt && onRemoveReceipt(id));
          updatedReceipts.forEach(r => onAddReceipt(r));
          alert(`Replaced ${count} occurrences.`);
          setFindText('');
          setReplaceText('');
      } else {
          alert("No matches found.");
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      
      const files: File[] = Array.from(e.target.files);
      setIsAnalyzing(true);
      setStatusText("Initializing batch...");
      setBatchProgress({ current: 0, total: files.length }); // Initial estimation, might change if zip expands

      try {
          const newReceipts: ReceiptData[] = [];

          // 1. Handle Zip Files
          const zips = files.filter(f => f.name.endsWith('.zip'));
          for (const zip of zips) {
              setStatusText(`Unpacking ${zip.name}...`);
              const buffer = await zip.arrayBuffer();
              
              // Helper to update progress from inside the zip processor
              const zipProgress = (done: number, total: number) => {
                  setBatchProgress({ current: done, total });
                  setStatusText(`Extracting from Zip: ${done}/${total}`);
              };

              const extracted = await extractReceiptsFromZip(buffer, zip.name, zipProgress);
              newReceipts.push(...extracted);
          }

          // 2. Handle Regular Files (Images/PDFs)
          const regulars = files.filter(f => !f.name.endsWith('.zip'));
          
          if (regulars.length > 0) {
               setStatusText(`Analyzing ${regulars.length} documents...`);
               // Adjust total for progress bar (Zip items + Regular items)
               // Simple logic: Reset progress for the batch of regulars
               setBatchProgress({ current: 0, total: regulars.length });
               
               const batchProgressHandler = (done: number, total: number) => {
                   setBatchProgress({ current: done, total });
                   setStatusText(`Analyzing: ${done}/${total}`);
               };

               const batchResults = await analyzeReceiptBatch(regulars, batchProgressHandler);
               newReceipts.push(...batchResults);
          }

          // 3. Workflow Decision
          if (files.length === 1 && !files[0].name.endsWith('.zip') && newReceipts.length === 1) {
              // Single File -> Review Modal
              setAnalyzedData(newReceipts[0]);
              // Also populate preview for the single file
              const file = files[0];
              const reader = new FileReader();
              reader.onload = (e) => setPreview(e.target?.result as string);
              reader.readAsDataURL(file);
          } else {
              // Bulk / Zip -> Auto Add
              newReceipts.forEach(r => onAddReceipt(r));
              setStatusText("Done!");
              await new Promise(r => setTimeout(r, 800)); // Show done briefly
          }
          
      } catch (e) {
          console.error(e);
          alert("Error processing files. Please ensure they are valid images, PDFs, or Zip archives.");
      } finally {
          setIsAnalyzing(false);
          setBatchProgress(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  // --- RECONCILIATION LOGIC ---

  const findProgrammaticMatches = () => {
      let exactMatchesFound = 0;
      setBankTransactions(prev => prev.map(tx => {
          if (tx.matchedReceiptId) return tx; // Already matched
          
          const match = receipts.find(r => {
               // 1. Exact Amount (within small float variance)
               const amtMatch = Math.abs(Math.abs(tx.amount) - r.amount) < 0.05;
               // 2. Date within 3 days
               const d1 = new Date(tx.date);
               const d2 = new Date(r.date);
               const dayDiff = Math.abs((d1.getTime() - d2.getTime()) / (1000 * 3600 * 24));
               const dateMatch = dayDiff <= 3;
               // 3. Not already matched
               const alreadyMatched = prev.some(t => t.matchedReceiptId === r.id);
               return amtMatch && dateMatch && !alreadyMatched;
          });

          if (match) {
              exactMatchesFound++;
              return { 
                  ...tx, 
                  matchedReceiptId: match.id, 
                  status: 'Reconciled', 
                  matchType: 'Exact',
                  aiSuggestion: 'Programmatic Exact Match (Amount & Date)' 
              };
          }
          return tx;
      }));
      return exactMatchesFound;
  };

  const handleMagicMatch = async () => {
      setIsMagicMatching(true);
      try {
          const exactCount = findProgrammaticMatches();
          const suggestions = await suggestMatches(bankTransactions.filter(t => !t.matchedReceiptId), receipts);
          
          if (suggestions.length > 0) {
              setMatchSuggestions(suggestions);
              setShowMatchReview(true);
          } else {
              if (exactCount > 0) alert(`Found ${exactCount} exact matches. No further AI matches found.`);
              else alert("No matches found.");
          }
      } catch (e) {
          console.error("Magic Match Failed", e);
      } finally {
          setIsMagicMatching(false);
      }
  };

  const handleManualTickLink = () => {
      if (checkedTxIds.size !== 1 || checkedRcptIds.size !== 1) {
          alert("Please select exactly one bank transaction and one receipt to link.");
          return;
      }
      const txId = Array.from(checkedTxIds)[0];
      const rcptId = Array.from(checkedRcptIds)[0];

      setBankTransactions(prev => prev.map(t => 
          t.id === txId 
          ? { ...t, matchedReceiptId: rcptId, status: 'Reconciled', matchType: 'Manual', aiSuggestion: 'Manually Linked via Checkbox' }
          : t
      ));
      setCheckedTxIds(new Set());
      setCheckedRcptIds(new Set());
  };

  const toggleTxCheck = (id: string) => {
      const next = new Set(checkedTxIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setCheckedTxIds(next);
  };

  const toggleRcptCheck = (id: string) => {
      const next = new Set(checkedRcptIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setCheckedRcptIds(next);
  };
  
  const acceptMatch = (suggestion: ReconciliationSuggestion) => {
      setBankTransactions(prev => prev.map(t => 
          t.id === suggestion.transactionId 
          ? { ...t, matchedReceiptId: suggestion.receiptId, status: 'Reconciled', matchType: 'AI', aiSuggestion: suggestion.reasoning }
          : t
      ));
      setMatchSuggestions(prev => prev.filter(s => s.transactionId !== suggestion.transactionId));
      if (matchSuggestions.length <= 1) setShowMatchReview(false);
  };

  const handleUnmatch = (txId: string) => {
      setBankTransactions(prev => prev.map(t => 
          t.id === txId 
          ? { ...t, matchedReceiptId: undefined, status: 'Unreconciled', matchType: undefined, aiSuggestion: undefined }
          : t
      ));
  };

  // --- RENDER HELPERS ---
  const renderMatchBadge = (type?: string) => {
      if (type === 'Exact') return <span className="text-[10px] font-bold bg-emerald-500 text-black px-2 py-0.5 rounded-full">EXACT</span>;
      if (type === 'AI') return <span className="text-[10px] font-bold bg-purple-500 text-white px-2 py-0.5 rounded-full">AI</span>;
      if (type === 'Manual') return <span className="text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full">MANUAL</span>;
      return null;
  };

  // --- RENDER ---
  return (
    <div className="flex flex-col h-full gap-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/5 pb-6">
        <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Financial Vision</h2>
            <p className="text-zinc-400 mt-2 font-light">Ledger management and intelligent bank reconciliation.</p>
        </div>
        <div className="flex gap-4 items-center">
            <button onClick={onOpenCapture} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors bg-zinc-900" title="Capture Snapshot">
                <Camera className="w-5 h-5" />
            </button>
            <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-white/10 backdrop-blur-sm mt-4 md:mt-0">
                <button onClick={() => setActiveTab('ledger')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${activeTab === 'ledger' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Ledger</button>
                <button onClick={() => setActiveTab('reconciliation')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${activeTab === 'reconciliation' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}><Scale className="w-4 h-4" /> Reconciliation</button>
            </div>
        </div>
      </header>

      {/* SEARCH AND REPLACE TOOLBAR */}
      {showSearchReplace && (
          <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl flex flex-wrap items-center gap-4 animate-in slide-in-from-top-2 mb-4">
              <span className="text-sm font-bold text-white flex items-center gap-2"><Replace className="w-4 h-4" /> Find & Replace</span>
              <select 
                value={searchField} 
                onChange={(e) => setSearchField(e.target.value as keyof ReceiptData)}
                className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm text-white"
              >
                  <option value="vendor">Vendor</option>
                  <option value="category">Category</option>
                  <option value="description">Description</option>
                  <option value="notes">Notes</option>
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

      {activeTab === 'ledger' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full min-h-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Upload Area */}
            <div className="lg:col-span-4 bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 flex flex-col gap-6 shadow-2xl h-fit">
                 <div onClick={() => !isAnalyzing && fileInputRef.current?.click()} className="group border-2 border-dashed border-zinc-700/50 hover:border-indigo-500/50 rounded-2xl h-48 flex flex-col items-center justify-center cursor-pointer bg-black/20 hover:bg-black/40 transition-all duration-300 relative overflow-hidden">
                    {preview && !isAnalyzing && <img src={preview} alt="preview" className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-10 transition-opacity blur-sm" />}
                    {isAnalyzing ? (
                         <div className="relative z-10 flex flex-col items-center gap-3 w-full px-8">
                            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                            <span className="text-zinc-300 text-sm font-medium tracking-wide text-center">{statusText}</span>
                            {batchProgress && (
                                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
                                    <div 
                                        className="h-full bg-indigo-500 transition-all duration-300" 
                                        style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                    />
                                </div>
                            )}
                         </div>
                    ) : (
                        <div className="relative z-10 flex flex-col items-center gap-2 group-hover:-translate-y-1 transition-transform duration-300">
                            <div className="flex gap-2">
                                <Upload className="text-zinc-400 group-hover:text-indigo-400 w-6 h-6" />
                                <FileArchive className="text-zinc-500 group-hover:text-indigo-400 w-6 h-6 opacity-50" />
                            </div>
                            <span className="text-zinc-300 font-medium">Drop Receipts or Zip</span>
                            <span className="text-[10px] text-zinc-500">Supports Bulk Upload</span>
                        </div>
                    )}
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        multiple 
                        accept=".jpg,.jpeg,.png,.pdf,.zip,.webp" 
                        onChange={handleFileUpload} 
                    />
                </div>
                {/* Single Edit Form (Only shows if single file upload) */}
                {analyzedData && (
                     <div className="bg-black/40 p-5 rounded-2xl border border-white/10 space-y-5 animate-in slide-in-from-left-2">
                         <div className="flex items-center justify-between border-b border-white/5 pb-3">
                             <span className="text-xs font-bold text-white uppercase tracking-wider">Review Receipt</span>
                             <button onClick={() => { setAnalyzedData(null); setPreview(null); }} className="text-zinc-500 hover:text-white"><X className="w-4 h-4"/></button>
                         </div>
                         <input value={analyzedData.vendor} onChange={e=>setAnalyzedData({...analyzedData, vendor:e.target.value})} className="bg-transparent text-white font-bold w-full focus:outline-none text-xl border-b border-zinc-700" />
                         <div className="flex gap-2">
                            <input type="number" value={analyzedData.amount} onChange={e=>setAnalyzedData({...analyzedData, amount:parseFloat(e.target.value)})} className="bg-transparent text-white w-24 focus:outline-none font-mono text-xl" />
                            <span className="text-zinc-500">{analyzedData.currency}</span>
                         </div>
                         <div className="text-xs text-zinc-500 truncate" title={analyzedData.sourceUrl}>Source: {analyzedData.sourceUrl}</div>
                         <button onClick={() => { onAddReceipt(analyzedData); setAnalyzedData(null); setPreview(null); }} className="w-full bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-500">Save</button>
                     </div>
                 )}
            </div>

            <div className="lg:col-span-8 flex flex-col gap-8">
                 {/* Chart */}
                 <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-64 shadow-xl">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12}} dy={10} />
                            <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', color: '#fff'}} />
                            <Bar dataKey="value" fill="#6366f1" radius={[6,6,0,0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                 </div>
                 
                 {/* Table */}
                 <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl flex-1 overflow-hidden flex flex-col shadow-xl min-h-[400px]">
                     <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                         <h3 className="text-white font-semibold flex items-center gap-2"><ListChecks className="w-4 h-4 text-zinc-400"/> Recent Transactions</h3>
                         <div className="flex gap-2">
                            <button onClick={() => setShowSearchReplace(!showSearchReplace)} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors" title="Find & Replace"><Replace className="w-4 h-4"/></button>
                            <button onClick={() => setShowColumnOptions(!showColumnOptions)} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"><SlidersHorizontal className="w-4 h-4" /></button>
                         </div>
                     </div>
                     <div className="overflow-auto flex-1 custom-scrollbar">
                         <table className="w-full text-left text-sm text-zinc-400 border-collapse">
                             <thead className="bg-zinc-900/80 text-zinc-500 sticky top-0 backdrop-blur-md z-10">
                                 <tr>
                                     {columns.filter(c=>c.visible).map(c => (
                                         <th key={c.id} onClick={() => c.sortable && handleSort(c.id)} className={`p-4 font-medium text-xs uppercase tracking-wider ${c.sortable ? 'cursor-pointer hover:text-zinc-300 transition-colors' : ''}`}>
                                             <div className="flex items-center gap-2">{c.label} {c.sortable && <ArrowUpDown className="w-3 h-3 opacity-50" />}</div>
                                         </th>
                                     ))}
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-white/5">
                                 {sortedReceipts.map(r => (
                                     <tr key={r.id} className="hover:bg-white/5 transition-colors group">
                                         {columns.filter(c=>c.visible).map(c => (
                                             <td key={c.id} className="p-4">
                                                 {c.id === 'amount' ? <span className="text-white font-mono font-medium">{r.amount.toFixed(2)} {r.currency}</span> : 
                                                  c.id === 'link' ? (r.sourceUrl && r.sourceUrl !== 'Upload' ? <span className="text-zinc-500 text-xs flex items-center gap-1" title={r.sourceUrl}><ExternalLink className="w-3 h-3" /> {r.sourceUrl.split('/').pop()?.slice(0, 10)}...</span> : '-') :
                                                  c.id === 'actions' ? <button onClick={() => onRemoveReceipt && onRemoveReceipt(r.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/10 rounded text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button> :
                                                  String(r[c.id as keyof ReceiptData] || '')}
                                             </td>
                                         ))}
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                 </div>
            </div>
        </div>
      )}

      {activeTab === 'reconciliation' && (
          <div className="flex flex-col h-full gap-8 animate-in fade-in slide-in-from-right-4 duration-500 relative">
              {/* Reconciliation Charts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-64">
                   <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 flex flex-col">
                       <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Reconciliation Progress</h4>
                       <div className="flex-1">
                           <ResponsiveContainer width="100%" height="100%">
                               <PieChart>
                                   <Pie 
                                      data={[
                                          { name: 'Matched', value: reconciliationStats.matched },
                                          { name: 'Unmatched', value: reconciliationStats.missing + reconciliationStats.unreconciled }
                                      ]}
                                      innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value"
                                   >
                                       <Cell fill="#10b981" />
                                       <Cell fill="#f43f5e" />
                                   </Pie>
                                   <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', color: '#fff'}} itemStyle={{fontSize:'12px'}} />
                                   <Legend verticalAlign="bottom" height={36} />
                               </PieChart>
                           </ResponsiveContainer>
                       </div>
                   </div>
                   <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 flex flex-col">
                       <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Match Source</h4>
                       <div className="flex-1">
                           <ResponsiveContainer width="100%" height="100%">
                               <BarChart data={[
                                   { name: 'Exact', value: reconciliationStats.exactMatches },
                                   { name: 'AI', value: reconciliationStats.aiMatches },
                                   { name: 'Manual', value: reconciliationStats.manualMatches }
                               ]}>
                                   <XAxis dataKey="name" tick={{fill:'#71717a', fontSize:10}} axisLine={false} tickLine={false} />
                                   <Tooltip cursor={{fill:'transparent'}} contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', color: '#fff'}} />
                                   <Bar dataKey="value" radius={[4,4,0,0]}>
                                       <Cell fill="#10b981" />
                                       <Cell fill="#a855f7" />
                                       <Cell fill="#3b82f6" />
                                   </Bar>
                               </BarChart>
                           </ResponsiveContainer>
                       </div>
                   </div>
                   <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 flex flex-col justify-center gap-4">
                       <div className="flex justify-between items-end border-b border-white/5 pb-2">
                           <span className="text-zinc-400 text-sm">Matched Value</span>
                           <span className="text-emerald-400 font-mono text-xl font-bold">${reconciliationStats.matchedAmount.toFixed(0)}</span>
                       </div>
                       <div className="flex justify-between items-end border-b border-white/5 pb-2">
                           <span className="text-zinc-400 text-sm">Missing Docs Value</span>
                           <span className="text-rose-400 font-mono text-xl font-bold">${reconciliationStats.unmatchedAmount.toFixed(0)}</span>
                       </div>
                   </div>
              </div>
              
              {/* Toolbar */}
              <div className="flex justify-between items-center bg-zinc-900/30 p-2 rounded-2xl border border-white/5 backdrop-blur-md">
                   <div className="flex gap-2">
                       <div className="bg-black/40 p-1 rounded-xl border border-white/5 flex gap-1">
                           <button onClick={() => setReconcileView('split')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${reconcileView === 'split' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}><SplitSquareVertical className="w-4 h-4" /> Split View (Manual)</button>
                           <button onClick={() => setReconcileView('unified')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${reconcileView === 'unified' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}><Table className="w-4 h-4" /> Unified Report</button>
                       </div>
                   </div>
                   
                   <div className="flex gap-2">
                       <button onClick={findProgrammaticMatches} className="px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2">
                            <Zap className="w-3 h-3" /> Exact Match
                       </button>
                       <button onClick={handleMagicMatch} disabled={isMagicMatching} className="px-4 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2">
                            {isMagicMatching ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3" />} AI Match
                       </button>
                   </div>
              </div>

              {/* Main Workspace */}
              {reconcileView === 'split' ? (
                  <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 relative">
                      {/* Left: Bank Feed */}
                      <div className="flex-1 bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                              <h3 className="font-semibold text-white flex items-center gap-2"><ArrowRight className="w-4 h-4 text-emerald-400" /> Bank Feed</h3>
                              <div className="flex gap-2">
                                 <button onClick={() => bankInputRef.current?.click()} className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg transition-colors hover:bg-zinc-700"><Upload className="w-4 h-4"/></button>
                                 <input type="file" ref={bankInputRef} className="hidden" onChange={async (e) => {
                                     const f = e.target.files?.[0];
                                     if(f) {
                                         const reader = new FileReader();
                                         reader.onloadend = async () => setBankTransactions(await parseBankStatement((reader.result as string).split(',')[1], f.type));
                                         reader.readAsDataURL(f);
                                     }
                                }} />
                              </div>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                              {filteredBankTx.map(tx => (
                                  <div key={tx.id} className={`p-4 rounded-xl border flex gap-3 transition-all ${tx.matchedReceiptId ? 'bg-emerald-900/5 border-emerald-500/20 opacity-60' : 'bg-black/40 border-white/5'}`}>
                                      {!tx.matchedReceiptId && (
                                        <button onClick={() => toggleTxCheck(tx.id)} className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${checkedTxIds.has(tx.id) ? 'bg-indigo-600 border-indigo-500' : 'border-zinc-700 hover:border-zinc-500'}`}>
                                            {checkedTxIds.has(tx.id) && <Check className="w-3 h-3 text-white" />}
                                        </button>
                                      )}
                                      <div className="flex-1">
                                          <div className="flex justify-between items-start">
                                              <div>
                                                  <p className="text-zinc-200 text-sm font-semibold">{tx.description}</p>
                                                  <p className="text-zinc-500 text-xs font-mono mt-1">{tx.date}</p>
                                              </div>
                                              <div className="text-right">
                                                  <p className={`font-mono text-sm font-bold ${tx.amount > 0 ? 'text-emerald-400' : 'text-white'}`}>{tx.amount.toFixed(2)}</p>
                                                  {renderMatchBadge(tx.matchType)}
                                              </div>
                                          </div>
                                          {tx.matchedReceiptId && <button onClick={() => handleUnmatch(tx.id)} className="text-[10px] text-red-400 hover:underline mt-2">Unlink</button>}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>

                      {/* Right: Receipts */}
                      <div className="flex-1 bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                              <h3 className="font-semibold text-white flex items-center gap-2"><ArrowRight className="w-4 h-4 text-indigo-400" /> Receipt Inbox</h3>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                              {filteredReceipts.map(r => {
                                  const isMatched = bankTransactions.some(t => t.matchedReceiptId === r.id);
                                  return (
                                  <div key={r.id} className={`p-4 rounded-xl border transition-all flex gap-3 ${isMatched ? 'bg-emerald-900/5 border-emerald-500/20 opacity-60' : 'bg-black/40 border-white/5'}`}>
                                      {!isMatched && (
                                        <button onClick={() => toggleRcptCheck(r.id)} className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${checkedRcptIds.has(r.id) ? 'bg-indigo-600 border-indigo-500' : 'border-zinc-700 hover:border-zinc-500'}`}>
                                            {checkedRcptIds.has(r.id) && <Check className="w-3 h-3 text-white" />}
                                        </button>
                                      )}
                                      <div className="flex-1">
                                          <div className="flex justify-between items-start">
                                              <div>
                                                  <p className="text-zinc-200 text-sm font-semibold">{r.vendor}</p>
                                                  <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                                                      <span>{r.date}</span>
                                                      <span className="bg-white/5 px-2 py-0.5 rounded text-[10px] border border-white/5">{r.category}</span>
                                                  </div>
                                              </div>
                                              <div className="text-right">
                                                  <p className="text-white font-mono text-sm font-bold">{r.amount.toFixed(2)} {r.currency}</p>
                                                  {r.sourceUrl && r.sourceUrl !== 'Upload' && (
                                                      <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:underline flex items-center gap-1 justify-end">
                                                          <ExternalLink className="w-3 h-3"/> View
                                                      </a>
                                                  )}
                                              </div>
                                          </div>
                                      </div>
                                  </div>
                                  );
                              })}
                          </div>
                      </div>

                      {/* Floating Link Action */}
                      {checkedTxIds.size > 0 && checkedRcptIds.size > 0 && (
                          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 zoom-in-95">
                              <button 
                                onClick={handleManualTickLink}
                                className="bg-blue-600 hover:bg-blue-500 text-white pl-4 pr-6 py-3 rounded-full shadow-2xl flex items-center gap-3 font-semibold text-sm transition-all hover:scale-105 border border-blue-400/50"
                              >
                                  <div className="bg-white/20 p-1.5 rounded-full"><LinkIcon className="w-4 h-4" /></div>
                                  Link Selected ({checkedTxIds.size} + {checkedRcptIds.size})
                              </button>
                          </div>
                      )}
                  </div>
              ) : (
                  // Unified Report View (Existing with visual tweaks)
                  <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl flex-1 overflow-hidden flex flex-col shadow-2xl animate-in fade-in">
                       {/* ... Table Header ... */}
                       <div className="overflow-auto flex-1 custom-scrollbar">
                          <table className="w-full text-left text-sm border-collapse">
                              <thead className="bg-zinc-900/90 text-zinc-500 sticky top-0 z-10 font-bold uppercase text-xs tracking-wider backdrop-blur-md shadow-sm">
                                  <tr>
                                      <th className="p-4 border-b border-white/5">Status</th>
                                      <th className="p-4 border-b border-white/5 bg-zinc-900/50">Bank Date</th>
                                      <th className="p-4 border-b border-white/5 bg-zinc-900/50">Description</th>
                                      <th className="p-4 border-b border-white/5 bg-zinc-900/50 text-right">Amount</th>
                                      <th className="p-4 border-b border-white/5 border-l border-white/5 bg-indigo-900/10 text-indigo-300/70">Vendor</th>
                                      <th className="p-4 border-b border-white/5 bg-indigo-900/10 text-indigo-300/70 text-right">Amount</th>
                                      <th className="p-4 border-b border-white/5 border-l border-white/5 text-right">Variance</th>
                                      <th className="p-4 border-b border-white/5 w-10">Doc</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {unifiedReportData.map((row, idx) => (
                                      <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                          <td className="p-4 align-middle">
                                              <div className="flex flex-col items-center gap-1">
                                                {row.status === 'MATCHED' && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                                                {row.status === 'MISSING_RECEIPT' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                                                {row.matchType && renderMatchBadge(row.matchType)}
                                              </div>
                                          </td>
                                          <td className="p-4 bg-zinc-900/20 font-mono text-zinc-400 text-xs">{row.date}</td>
                                          <td className="p-4 bg-zinc-900/20 text-zinc-300 max-w-[200px] truncate font-medium" title={row.bankDesc}>{row.bankDesc || '-'}</td>
                                          <td className="p-4 bg-zinc-900/20 text-right font-mono text-zinc-300">{row.bankAmount ? row.bankAmount.toFixed(2) : '-'}</td>
                                          
                                          <td className="p-4 border-l border-white/5 bg-indigo-900/5 text-indigo-200 font-medium">{row.receiptVendor || '-'}</td>
                                          <td className="p-4 bg-indigo-900/5 text-right font-mono text-indigo-200">{row.receiptAmount ? row.receiptAmount.toFixed(2) : '-'}</td>
                                          
                                          <td className="p-4 border-l border-white/5 text-right font-mono font-bold">
                                              {row.variance && parseFloat(row.variance) !== 0 ? (
                                                  <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">{row.variance}</span>
                                              ) : row.status === 'MATCHED' ? (
                                                  <span className="text-emerald-500/50">0.00</span>
                                              ) : '-'}
                                          </td>
                                          
                                          <td className="p-4 text-center">
                                              {row.sourceUrl && row.sourceUrl !== 'Upload' && (
                                                  <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-indigo-400 transition-colors inline-block p-1">
                                                      <ExternalLink className="w-3.5 h-3.5" />
                                                  </a>
                                              )}
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}

              {/* Match Review Modal (Keep Existing) */}
              {showMatchReview && (
                  <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
                          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-zinc-900">
                              <div>
                                  <h3 className="text-xl font-bold text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-400" /> AI Match Review</h3>
                                  <p className="text-zinc-400 text-sm mt-1">Gemini identified {matchSuggestions.length} high-confidence matches.</p>
                              </div>
                              <button onClick={() => setShowMatchReview(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"><X className="w-5 h-5"/></button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-black/20">
                              {matchSuggestions.map(suggestion => {
                                  const tx = bankTransactions.find(t => t.id === suggestion.transactionId);
                                  const rcpt = receipts.find(r => r.id === suggestion.receiptId);
                                  if (!tx || !rcpt) return null;

                                  return (
                                      <div key={suggestion.transactionId} className="bg-zinc-900/80 border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                                          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                                          <div className="flex items-center justify-between mb-5 pl-2">
                                              <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                                                  {(suggestion.confidence * 100).toFixed(0)}% AI CONFIDENCE
                                              </span>
                                              <span className="text-xs text-zinc-400 italic flex items-center gap-1"><Wand2 className="w-3 h-3"/> {suggestion.reasoning}</span>
                                          </div>
                                          <div className="flex gap-6 items-center pl-2">
                                              <div className="flex-1 space-y-2">
                                                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Bank Transaction</p>
                                                  <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                                      <p className="text-white text-sm font-semibold truncate">{tx.description}</p>
                                                      <div className="flex justify-between mt-2 text-xs">
                                                          <span className="text-zinc-500 font-mono">{tx.date}</span>
                                                          <span className="text-white font-mono font-bold">{tx.amount.toFixed(2)}</span>
                                                      </div>
                                                  </div>
                                              </div>
                                              <div className="text-zinc-600"><ArrowRight className="w-6 h-6" /></div>
                                              <div className="flex-1 space-y-2">
                                                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Receipt Document</p>
                                                  <div className="bg-indigo-900/10 p-3 rounded-xl border border-indigo-500/20">
                                                      <p className="text-indigo-100 text-sm font-semibold truncate">{rcpt.vendor}</p>
                                                      <div className="flex justify-between mt-2 text-xs">
                                                          <span className="text-indigo-300/60 font-mono">{rcpt.date}</span>
                                                          <span className="text-indigo-200 font-mono font-bold">{rcpt.amount.toFixed(2)}</span>
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                          <div className="mt-6 flex gap-3 pl-2">
                                              <button onClick={() => acceptMatch(suggestion)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20">Confirm Match</button>
                                              <button onClick={() => setMatchSuggestions(s => s.filter(i => i.transactionId !== suggestion.transactionId))} className="px-6 bg-white/5 hover:bg-white/10 text-zinc-300 py-2.5 rounded-xl text-sm font-medium transition-colors">Dismiss</button>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  </div>
              )}
          </div>
      )}
    </div>
  );
};
