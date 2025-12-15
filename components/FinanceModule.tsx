
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ReceiptData, IntegrationAccount, BankTransaction, ReconciliationSuggestion, ViewState, AppSettings } from '../types';
import { analyzeReceipt, parseBankStatement, suggestMatches, extractReceiptsFromZip, analyzeReceiptBatch } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { Upload, CheckCircle2, AlertCircle, Loader2, DollarSign, Calendar, FileText, RefreshCw, Plus, X, FileSpreadsheet, FileJson, AlertTriangle, Calculator, Scale, Trash2, Tag, Camera, ClipboardPaste, SlidersHorizontal, ChevronDown, ChevronUp, Eye, EyeOff, Wand2, MessageSquare, Sparkles, ArrowUpDown, Percent, Layers, ListChecks, Zap, Link as LinkIcon, ArrowRight, Download, MoreHorizontal, Table, SplitSquareVertical, ShieldCheck, HelpCircle, Filter, Check, XCircle, MousePointerClick, ExternalLink, Search, Replace, CheckSquare, Square, FileArchive, PlayCircle, Coins, PieChart as PieIcon, TrendingUp, BarChart3, Binary } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, ComposedChart, Line } from 'recharts';
import JSZip from 'jszip';
import { ProcessingStatus } from './ProcessingStatus';

// Helper to guess mime type
const getMimeType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    return 'application/octet-stream';
};

interface FinanceModuleProps {
  receipts: ReceiptData[];
  onAddReceipt: (receipt: ReceiptData) => void;
  onRemoveReceipt?: (id: string) => void;
  accounts: IntegrationAccount[];
  onOpenCapture: () => void;
  bankTransactions: BankTransaction[];
  onUpdateBankTransactions: (txs: BankTransaction[] | ((prev: BankTransaction[]) => BankTransaction[])) => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
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

export const FinanceModule: React.FC<FinanceModuleProps> = ({ 
    receipts, 
    onAddReceipt, 
    onRemoveReceipt, 
    accounts, 
    onOpenCapture,
    bankTransactions,
    onUpdateBankTransactions,
    settings,
    onUpdateSettings
}) => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'ledger' | 'reconciliation'>('ledger');
  
  // Ledger
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number} | null>(null); // Progress State
  const [statusText, setStatusText] = useState("Analyzing...");
  const [processingMode, setProcessingMode] = useState<'CLOUD' | 'LOCAL' | 'HYBRID'>('CLOUD');
  
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzedData, setAnalyzedData] = useState<ReceiptData | null>(null);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [ledgerViewMode, setLedgerViewMode] = useState<'list' | 'analytics'>('list');
  
  // Receipt Details Modal
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);

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
  const [reconcileView, setReconcileView] = useState<'split' | 'unified' | 'analytics'>('split');
  const [reconcileFilter, setReconcileFilter] = useState<'all' | 'unmatched' | 'matched'>('unmatched');
  const [isMagicMatching, setIsMagicMatching] = useState(false);
  const [isBankAnalyzing, setIsBankAnalyzing] = useState(false); // Bank Processing
  const [matchSuggestions, setMatchSuggestions] = useState<ReconciliationSuggestion[]>([]);
  const [showMatchReview, setShowMatchReview] = useState(false);
  const bankInputRef = useRef<HTMLInputElement>(null);

  // Manual Matching State (Tick Box)
  const [checkedTxIds, setCheckedTxIds] = useState<Set<string>>(new Set());
  const [checkedRcptIds, setCheckedRcptIds] = useState<Set<string>>(new Set());

  // --- MEMOIZED CALCULATIONS ---

  const getRate = useCallback((code: string) => settings.exchangeRates[code] || 1, [settings.exchangeRates]);

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

  const totalLedgerValue = useMemo(() => {
      return receipts.reduce((acc, r) => {
          const rate = getRate(r.currency);
          return acc + (r.amount * rate);
      }, 0);
  }, [receipts, getRate]);

  // Aggregated Data for Analytics (Ledger)
  const ledgerAnalytics = useMemo(() => {
      const byCategory: Record<string, number> = {};
      const byMonth: Record<string, number> = {};
      const byVendor: Record<string, number> = {};

      receipts.forEach(r => {
          const amount = r.amount * getRate(r.currency);
          // Category
          byCategory[r.category] = (byCategory[r.category] || 0) + amount;
          // Month
          const month = r.date.substring(0, 7); // YYYY-MM
          byMonth[month] = (byMonth[month] || 0) + amount;
          // Vendor
          byVendor[r.vendor] = (byVendor[r.vendor] || 0) + amount;
      });

      return {
          categoryData: Object.entries(byCategory).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value),
          monthData: Object.entries(byMonth).map(([name, value]) => ({ name, value })).sort((a,b) => a.name.localeCompare(b.name)),
          vendorData: Object.entries(byVendor).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 10)
      };
  }, [receipts, getRate]);

  // Aggregated Data for Analytics (Reconciliation)
  const reconciliationAnalytics = useMemo(() => {
      // Reconciled Expenses by Category
      const reconciledByCategory: Record<string, number> = {};
      
      bankTransactions.forEach(tx => {
          if (tx.matchedReceiptId) {
              const r = receipts.find(r => r.id === tx.matchedReceiptId);
              if (r) {
                  const amt = Math.abs(tx.amount) * getRate(tx.currency);
                  reconciledByCategory[r.category] = (reconciledByCategory[r.category] || 0) + amt;
              }
          }
      });

      return {
          reconciledByCategory: Object.entries(reconciledByCategory).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value),
      };
  }, [bankTransactions, receipts, getRate]);

  // Enhanced Reconciliation Stats Calculation
  const reconciliationStats = useMemo(() => {
      // "Total" usually refers to Bank Transactions as the source of truth
      const targetTxs = bankTransactions; 
      
      let matchedCount = 0;
      let matchedAmount = 0;
      let totalExpenseAmount = 0;
      let missing = 0;
      
      let exactMatches = 0;
      let aiMatches = 0;
      let manualMatches = 0;

      targetTxs.forEach(tx => {
          // Normalize bank transaction amounts to reporting currency for stats
          const rate = getRate(tx.currency);
          const convertedTxAmount = Math.abs(tx.amount) * rate;

          if (tx.status === 'Ignored') return;
          if (tx.amount < 0) totalExpenseAmount += convertedTxAmount;
          
          if (tx.matchedReceiptId) {
              matchedCount++;
              matchedAmount += convertedTxAmount;
              if (tx.matchType === 'Exact') exactMatches++;
              else if (tx.matchType === 'AI') aiMatches++;
              else manualMatches++;
          } else if (tx.amount < 0 && tx.status === 'Unreconciled') {
              missing++;
          }
      });

      const totalCount = targetTxs.length;
      const progressPercent = totalCount > 0 ? (matchedCount / totalCount) * 100 : 0;
      const valuePercent = totalExpenseAmount > 0 ? (matchedAmount / totalExpenseAmount) * 100 : 0;

      return {
          matched: matchedCount,
          missing,
          unreconciled: totalCount - matchedCount,
          matchedAmount,
          unmatchedAmount: totalExpenseAmount - matchedAmount,
          totalAmount: totalExpenseAmount,
          exactMatches,
          aiMatches,
          manualMatches,
          totalTx: totalCount,
          progressPercent,
          valuePercent
      };
  }, [bankTransactions, settings.exchangeRates, getRate]);

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
              bankCurrency: tx.currency,
              receiptDate: match?.date || '',
              receiptVendor: match?.vendor || '',
              receiptAmount: match ? (match.amount * -1) : '',
              receiptCurrency: match?.currency || '',
              variance: match ? (Math.abs(tx.amount) - match.amount).toFixed(2) : '', // Raw variance, hard to normalize per row easily in display without clutter
              notes: tx.aiSuggestion || '',
              sourceUrl: match?.sourceUrl,
              bankSource: tx.sourceFile
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
                      bankCurrency: '',
                      receiptDate: r.date,
                      receiptVendor: r.vendor,
                      receiptAmount: r.amount, 
                      receiptCurrency: r.currency,
                      variance: '',
                      notes: 'Logged but not in bank',
                      sourceUrl: r.sourceUrl,
                      bankSource: '-'
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

  const processFileList = async (files: File[]) => {
      setIsAnalyzing(true);
      
      const hasZip = files.some(f => f.name.endsWith('.zip'));
      setProcessingMode(hasZip ? 'HYBRID' : 'CLOUD');
      
      setStatusText("Initializing batch...");
      setBatchProgress({ current: 0, total: files.length });

      try {
          const newReceipts: ReceiptData[] = [];
          const zips = files.filter(f => f.name.endsWith('.zip'));
          
          for (const zip of zips) {
              setStatusText(`Unpacking ${zip.name}...`);
              const buffer = await zip.arrayBuffer();
              const zipProgress = (done: number, total: number) => {
                  setBatchProgress({ current: done, total });
                  setStatusText(`Extracting from Zip: ${done}/${total}`);
              };
              const extracted = await extractReceiptsFromZip(buffer, zip.name, zipProgress);
              newReceipts.push(...extracted);
          }

          const regulars = files.filter(f => !f.name.endsWith('.zip'));
          if (regulars.length > 0) {
               setStatusText(`Analyzing ${regulars.length} documents...`);
               setBatchProgress({ current: 0, total: regulars.length });
               const batchProgressHandler = (done: number, total: number) => {
                   setBatchProgress({ current: done, total });
                   setStatusText(`Analyzing: ${done}/${total}`);
               };
               const batchResults = await analyzeReceiptBatch(regulars, batchProgressHandler);
               newReceipts.push(...batchResults);
          }

          if (files.length === 1 && !files[0].name.endsWith('.zip') && newReceipts.length === 1) {
              setAnalyzedData(newReceipts[0]);
              const file = files[0];
              const reader = new FileReader();
              reader.onload = (e) => setPreview(e.target?.result as string);
              reader.readAsDataURL(file);
          } else {
              newReceipts.forEach(r => onAddReceipt(r));
              setStatusText("Done!");
              await new Promise(r => setTimeout(r, 800));
          }
      } catch (e) {
          console.error(e);
          alert("Error processing files.");
      } finally {
          setIsAnalyzing(false);
          setBatchProgress(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const files: File[] = Array.from(e.target.files);
      await processFileList(files);
  };

  // --- RECONCILIATION LOGIC ---

  const runProgrammaticReconciliation = () => {
      let exactMatchesFound = 0;
      let matchedTxIds = new Set<string>();
      let matchedReceiptIds = new Set<string>();

      // Prepare map for receipts to avoid O(N^2)
      // Key: amount (rounded)
      const receiptsByAmount: Record<string, ReceiptData[]> = {};
      receipts.forEach(r => {
          if (bankTransactions.some(t => t.matchedReceiptId === r.id)) return; // Skip already matched receipts
          const key = Math.round(r.amount).toString(); // Round for loose bucket
          if (!receiptsByAmount[key]) receiptsByAmount[key] = [];
          receiptsByAmount[key].push(r);
      });

      // Pass 1: Strict Programmatic Matching
      const newTxs = bankTransactions.map(tx => {
          if (tx.matchedReceiptId) return tx; // Already matched
          
          const potentialReceipts = receiptsByAmount[Math.round(Math.abs(tx.amount)).toString()] || [];
          
          const match = potentialReceipts.find(r => {
               if (matchedReceiptIds.has(r.id)) return false;

               // Rule 1: Currency Match
               if (tx.currency !== r.currency) return false;

               // Rule 2: Amount Match (within 0.05)
               const amtMatch = Math.abs(Math.abs(tx.amount) - r.amount) < 0.05;
               
               // Rule 3: Date Vicinity (within 5 days)
               const d1 = new Date(tx.date);
               const d2 = new Date(r.date);
               const dayDiff = Math.abs((d1.getTime() - d2.getTime()) / (1000 * 3600 * 24));
               const dateMatch = dayDiff <= 5;

               return amtMatch && dateMatch;
          });

          if (match) {
              exactMatchesFound++;
              matchedTxIds.add(tx.id);
              matchedReceiptIds.add(match.id);
              return { 
                  ...tx, 
                  matchedReceiptId: match.id, 
                  status: 'Reconciled' as const, 
                  matchType: 'Exact' as const,
                  aiSuggestion: 'Programmatic Exact Match (Amount & Date)' 
              };
          }
          return tx;
      });

      return { newTxs, exactMatchesFound };
  };

  const handleMagicMatch = async () => {
      setIsMagicMatching(true);
      try {
          // 1. Run Programmatic First
          const { newTxs, exactMatchesFound } = runProgrammaticReconciliation();
          
          // 2. Identify remaining unmatched
          const unmatchedTxs = newTxs.filter(t => !t.matchedReceiptId);
          
          // 3. If unmatched exist, run AI
          let aiMatchesFound = 0;
          let suggestions: ReconciliationSuggestion[] = [];
          
          if (unmatchedTxs.length > 0 && receipts.length > 0) {
              const unmatchedReceipts = receipts.filter(r => !newTxs.some(t => t.matchedReceiptId === r.id));
              suggestions = await suggestMatches(unmatchedTxs, unmatchedReceipts);
              aiMatchesFound = suggestions.length;
          }

          // Update State
          if (exactMatchesFound > 0) {
              onUpdateBankTransactions(newTxs);
          }

          if (suggestions.length > 0) {
              setMatchSuggestions(suggestions);
              setShowMatchReview(true);
          } else {
              if (exactMatchesFound > 0) alert(`Auto-reconciled ${exactMatchesFound} items based on exact rules. No further AI matches found.`);
              else alert("No matches found.");
          }

      } catch (e) {
          console.error("Magic Match Failed", e);
          alert("Reconciliation failed.");
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

      onUpdateBankTransactions(prev => prev.map(t => 
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
      onUpdateBankTransactions(prev => prev.map(t => 
          t.id === suggestion.transactionId 
          ? { ...t, matchedReceiptId: suggestion.receiptId, status: 'Reconciled', matchType: 'AI', aiSuggestion: suggestion.reasoning }
          : t
      ));
      setMatchSuggestions(prev => prev.filter(s => s.transactionId !== suggestion.transactionId));
      if (matchSuggestions.length <= 1) setShowMatchReview(false);
  };

  const handleUnmatch = (txId: string) => {
      onUpdateBankTransactions(prev => prev.map(t => 
          t.id === txId 
          ? { ...t, matchedReceiptId: undefined, status: 'Unreconciled', matchType: undefined, aiSuggestion: undefined }
          : t
      ));
  };

  const updateRate = (code: string, newRate: number) => {
      const updated = { ...settings.exchangeRates, [code]: newRate };
      onUpdateSettings({ ...settings, exchangeRates: updated });
  };

  // --- RENDER HELPERS ---
  const renderMatchBadge = (type?: string) => {
      if (type === 'Exact') return <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1"><Binary className="w-3 h-3"/> RULE MATCH</span>;
      if (type === 'AI') return <span className="text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full flex items-center gap-1"><Sparkles className="w-3 h-3"/> AI MATCH</span>;
      if (type === 'Manual') return <span className="text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full flex items-center gap-1"><MousePointerClick className="w-3 h-3"/> MANUAL</span>;
      return null;
  };

  // Extract all unique currencies for Rate Management
  const availableCurrencies = useMemo(() => {
      const set = new Set<string>();
      receipts.forEach(r => set.add(r.currency));
      bankTransactions.forEach(t => set.add(t.currency));
      set.add(settings.currency); // Ensure reporting currency is there
      return Array.from(set);
  }, [receipts, bankTransactions, settings.currency]);

  // --- RENDER ---
  return (
    <div className="flex flex-col h-full gap-8">
      
      {/* PROCESSING INDICATORS */}
      <ProcessingStatus 
        isProcessing={isAnalyzing} 
        taskName={statusText} 
        progress={batchProgress && batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : undefined} 
        mode={processingMode}
      />
      <ProcessingStatus isProcessing={isBankAnalyzing} taskName="Parsing Bank Statement" mode="CLOUD" />
      <ProcessingStatus isProcessing={isMagicMatching} taskName="Auto-Reconciling Ledger" mode="CLOUD" />

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/5 pb-6">
        <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Accounting</h2>
            <p className="text-zinc-400 mt-2 font-light">Ledger management and intelligent bank reconciliation.</p>
        </div>
        <div className="flex gap-4 items-center">
            <button 
                onClick={() => setShowRatesModal(true)} 
                className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-2 text-xs font-medium" 
                title="Manage Exchange Rates"
            >
                <Coins className="w-4 h-4" /> Rates
            </button>
            <button onClick={onOpenCapture} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors bg-zinc-900" title="Capture Snapshot">
                <Camera className="w-5 h-5" />
            </button>
            <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-white/10 backdrop-blur-sm mt-4 md:mt-0">
                <button onClick={() => setActiveTab('ledger')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${activeTab === 'ledger' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Ledger</button>
                <button onClick={() => setActiveTab('reconciliation')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${activeTab === 'reconciliation' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}><Scale className="w-4 h-4" /> Reconciliation</button>
            </div>
        </div>
      </header>

      {/* RATES MODAL */}
      {showRatesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
              <div className="bg-zinc-950 border border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl">
                  <div className="flex justify-between items-center mb-6">
                      <div>
                          <h3 className="text-lg font-bold text-white flex items-center gap-2"><Coins className="w-5 h-5 text-indigo-400"/> Exchange Rates</h3>
                          <p className="text-xs text-zinc-500">Base Currency: <span className="text-white font-bold">{settings.currency}</span></p>
                      </div>
                      <button onClick={() => setShowRatesModal(false)}><X className="w-5 h-5 text-zinc-500 hover:text-white"/></button>
                  </div>
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                      {availableCurrencies.filter(c => c !== settings.currency).map(code => (
                          <div key={code} className="flex justify-between items-center p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                              <span className="font-mono text-white font-bold">{code}</span>
                              <div className="flex items-center gap-2">
                                  <span className="text-xs text-zinc-500">Rate:</span>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    value={settings.exchangeRates[code] || 1} 
                                    onChange={(e) => updateRate(code, parseFloat(e.target.value))}
                                    className="w-24 bg-black/40 border border-zinc-700 rounded-lg px-2 py-1 text-right text-white text-sm focus:outline-none focus:border-indigo-500"
                                  />
                              </div>
                          </div>
                      ))}
                      {availableCurrencies.length <= 1 && (
                          <p className="text-center text-zinc-500 text-sm py-4">No foreign currencies detected.</p>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* RECEIPT DETAIL MODAL (Keep existing) */}
      {selectedReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-zinc-950 border border-zinc-800 w-full max-w-4xl h-[85vh] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden">
                  {/* Left: Image/File Preview */}
                  <div className="md:w-1/2 bg-black border-r border-zinc-800 flex items-center justify-center p-4 relative group">
                      {selectedReceipt.imageUrl ? (
                          <img src={selectedReceipt.imageUrl} alt="Receipt" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
                      ) : (
                          <div className="text-center text-zinc-500 flex flex-col items-center">
                              <FileText className="w-20 h-20 mb-4 opacity-20" />
                              <p>No preview available.</p>
                              {selectedReceipt.sourceUrl && <span className="text-xs text-zinc-600 mt-2 truncate max-w-xs">{selectedReceipt.sourceUrl}</span>}
                          </div>
                      )}
                      {selectedReceipt.sourceUrl && selectedReceipt.sourceUrl !== 'Upload' && (
                          <a href={selectedReceipt.sourceUrl} target="_blank" rel="noreferrer" className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
                              <ExternalLink className="w-5 h-5"/>
                          </a>
                      )}
                  </div>

                  {/* Right: Details */}
                  <div className="md:w-1/2 flex flex-col h-full bg-zinc-900">
                      <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                          <div>
                              <h2 className="text-xl font-bold text-white">{selectedReceipt.vendor}</h2>
                              <p className="text-zinc-400 text-sm mt-1">{selectedReceipt.date} • {selectedReceipt.category}</p>
                          </div>
                          <button onClick={() => setSelectedReceipt(null)} className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"><X className="w-6 h-6"/></button>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                          <div className="grid grid-cols-2 gap-4">
                              <div className="bg-black/30 p-4 rounded-xl border border-zinc-800">
                                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total Amount</span>
                                  <p className="text-2xl font-mono font-bold text-emerald-400 mt-1">{selectedReceipt.amount.toFixed(2)} {selectedReceipt.currency}</p>
                                  {selectedReceipt.currency !== settings.currency && (
                                      <p className="text-xs text-zinc-500 mt-1">≈ {(selectedReceipt.amount * getRate(selectedReceipt.currency)).toFixed(2)} {settings.currency}</p>
                                  )}
                              </div>
                              <div className="bg-black/30 p-4 rounded-xl border border-zinc-800">
                                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">VAT / Tax</span>
                                  <p className="text-2xl font-mono font-bold text-zinc-300 mt-1">{selectedReceipt.vatAmount ? selectedReceipt.vatAmount.toFixed(2) : '0.00'}</p>
                              </div>
                          </div>

                          <div>
                              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Description</h3>
                              <p className="text-zinc-200 text-sm leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                                  {selectedReceipt.description || "No description available."}
                              </p>
                          </div>

                          <div>
                              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Tags & Metadata</h3>
                              <div className="flex flex-wrap gap-2">
                                  {selectedReceipt.tags?.map(tag => (
                                      <span key={tag} className="text-xs bg-indigo-500/10 text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-500/20">{tag}</span>
                                  ))}
                                  {selectedReceipt.taxDeductible && (
                                      <span className="text-xs bg-emerald-500/10 text-emerald-300 px-3 py-1.5 rounded-lg border border-emerald-500/20 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Tax Deductible</span>
                                  )}
                              </div>
                          </div>
                          
                          {selectedReceipt.notes && (
                              <div>
                                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Notes</h3>
                                  <p className="text-sm text-zinc-400 italic">{selectedReceipt.notes}</p>
                              </div>
                          )}
                      </div>
                      
                      <div className="p-6 border-t border-zinc-800 bg-black/20">
                          <button onClick={() => setSelectedReceipt(null)} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors">Close Details</button>
                      </div>
                  </div>
              </div>
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
                {/* Single Edit Form */}
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
                 {/* Aggregated Quick Stats (Mini) */}
                 <div className="space-y-3">
                     <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Top Categories</h4>
                     {ledgerAnalytics.categoryData.slice(0, 4).map((cat, i) => (
                         <div key={i} className="flex justify-between items-center text-xs">
                             <span className="text-zinc-400">{cat.name}</span>
                             <span className="text-white font-mono">{cat.value.toFixed(0)}</span>
                         </div>
                     ))}
                 </div>
            </div>

            <div className="lg:col-span-8 flex flex-col gap-8">
                 {/* View Toggle */}
                 <div className="flex justify-end mb-[-20px] relative z-10">
                     <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex gap-1">
                         <button onClick={() => setLedgerViewMode('list')} className={`p-2 rounded-lg transition-colors ${ledgerViewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}><ListChecks className="w-4 h-4" /></button>
                         <button onClick={() => setLedgerViewMode('analytics')} className={`p-2 rounded-lg transition-colors ${ledgerViewMode === 'analytics' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}><BarChart3 className="w-4 h-4" /></button>
                     </div>
                 </div>

                 {ledgerViewMode === 'analytics' ? (
                     <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl space-y-8 animate-in fade-in">
                         <div className="h-64">
                             <h4 className="text-sm font-bold text-white mb-4">Expenses by Month</h4>
                             <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={ledgerAnalytics.monthData}>
                                    <XAxis dataKey="name" tick={{fill:'#71717a', fontSize:10}} />
                                    <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a'}} formatter={(value:any) => `${value.toFixed(0)} ${settings.currency}`} />
                                    <Bar dataKey="value" fill="#6366f1" radius={[4,4,0,0]} />
                                </BarChart>
                             </ResponsiveContainer>
                         </div>
                         <div className="grid grid-cols-2 gap-6 h-64">
                             <div>
                                 <h4 className="text-sm font-bold text-white mb-4">By Category</h4>
                                 <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={ledgerAnalytics.categoryData} innerRadius={40} outerRadius={60} dataKey="value" paddingAngle={2}>
                                            {ledgerAnalytics.categoryData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={['#6366f1', '#a855f7', '#ec4899', '#10b981'][index % 4]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a'}} />
                                        <Legend verticalAlign="middle" align="right" layout="vertical" />
                                    </PieChart>
                                 </ResponsiveContainer>
                             </div>
                             <div>
                                 <h4 className="text-sm font-bold text-white mb-4">Top Vendors</h4>
                                 <div className="space-y-2 overflow-y-auto max-h-full pr-2 custom-scrollbar">
                                     {ledgerAnalytics.vendorData.map((v, i) => (
                                         <div key={i} className="flex justify-between items-center p-2 bg-black/20 rounded border border-white/5">
                                             <span className="text-xs text-zinc-300 truncate w-32" title={v.name}>{v.name}</span>
                                             <span className="text-xs font-mono text-white">{v.value.toFixed(0)}</span>
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         </div>
                     </div>
                 ) : (
                     // Ledger List View
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
                                                      c.id === 'link' ? <button onClick={() => setSelectedReceipt(r)} className="text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 p-1.5 rounded-lg border border-indigo-500/20"><Eye className="w-3.5 h-3.5" /></button> :
                                                      c.id === 'actions' ? <button onClick={() => onRemoveReceipt && onRemoveReceipt(r.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/10 rounded text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button> :
                                                      String(r[c.id as keyof ReceiptData] || '')}
                                                 </td>
                                             ))}
                                         </tr>
                                     ))}
                                 </tbody>
                                 {/* Ledger Footer Total */}
                                 <tfoot className="bg-zinc-900/80 backdrop-blur-md border-t border-white/10">
                                     <tr>
                                         <td colSpan={columns.filter(c=>c.visible).length} className="p-4 text-right">
                                             <span className="text-xs text-zinc-500 mr-2 uppercase font-bold tracking-wider">Total Ledger Value:</span>
                                             <span className="text-white font-mono font-bold text-lg">{totalLedgerValue.toLocaleString(undefined, {minimumFractionDigits: 2})} <span className="text-sm text-zinc-500">{settings.currency}</span></span>
                                         </td>
                                     </tr>
                                 </tfoot>
                             </table>
                         </div>
                     </div>
                 )}
            </div>
        </div>
      )}

      {activeTab === 'reconciliation' && (
          <div className="flex flex-col h-full gap-8 animate-in fade-in slide-in-from-right-4 duration-500 relative">
              {/* RECONCILIATION CONTROL CENTER */}
              <div className="bg-zinc-900/60 border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none" />
                  
                  <div className="flex flex-col lg:flex-row gap-8 relative z-10">
                      {/* Left: Input & Status */}
                      <div className="flex-1 space-y-6">
                          <div>
                              <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                  Reconciliation Hub
                                  {isBankAnalyzing && <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full animate-pulse border border-indigo-500/30">Processing...</span>}
                              </h3>
                              <p className="text-zinc-400 text-sm mt-1">
                                  {bankTransactions.length > 0 
                                    ? `Loaded ${bankTransactions.length} transactions. Ready to reconcile.` 
                                    : "Upload a bank statement to begin matching."}
                              </p>
                          </div>
                          
                          <div className="flex gap-3">
                               <button 
                                    onClick={() => bankInputRef.current?.click()} 
                                    disabled={isBankAnalyzing}
                                    className="flex items-center gap-3 px-5 py-3 text-sm font-bold text-white bg-emerald-600/90 hover:bg-emerald-500 rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                                >
                                    {isBankAnalyzing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
                                    {isBankAnalyzing ? "Analyzing Feed..." : "Upload Bank Feed"}
                               </button>
                               <input type="file" ref={bankInputRef} className="hidden" onChange={async (e) => {
                                     const f = e.target.files?.[0];
                                     if(f) {
                                         setIsBankAnalyzing(true);
                                         const reader = new FileReader();
                                         reader.onloadend = async () => {
                                             try {
                                                const txs = await parseBankStatement((reader.result as string).split(',')[1], f.type);
                                                onUpdateBankTransactions(txs.map(t => ({...t, sourceFile: f.name})));
                                             } catch(e) {
                                                 alert("Failed to parse bank statement");
                                             } finally {
                                                 setIsBankAnalyzing(false);
                                             }
                                         }
                                         reader.readAsDataURL(f);
                                     }
                                }} />
                          </div>
                      </div>

                      {/* Middle: Visual Stats */}
                      <div className="flex-[2] grid grid-cols-2 gap-6 border-l border-white/5 pl-6 lg:border-l lg:pl-8">
                          {/* Count Progress */}
                          <div className="space-y-3">
                              <div className="flex justify-between items-end">
                                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Tx Count Match</span>
                                  <span className="text-xl font-mono font-bold text-white">{reconciliationStats.progressPercent.toFixed(0)}%</span>
                              </div>
                              <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${reconciliationStats.progressPercent}%` }} />
                              </div>
                              <div className="flex justify-between text-[10px] text-zinc-400">
                                  <span>{reconciliationStats.matched} Matched</span>
                                  <span>{reconciliationStats.unreconciled} Pending</span>
                              </div>
                          </div>

                          {/* Value Progress */}
                          <div className="space-y-3">
                              <div className="flex justify-between items-end">
                                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Value Match ({settings.currency})</span>
                                  <span className="text-xl font-mono font-bold text-white">{reconciliationStats.valuePercent.toFixed(0)}%</span>
                              </div>
                              <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${reconciliationStats.valuePercent}%` }} />
                              </div>
                              <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                                  <span>{reconciliationStats.matchedAmount.toFixed(0)}</span>
                                  <span className="text-rose-400">-{reconciliationStats.unmatchedAmount.toFixed(0)}</span>
                              </div>
                          </div>
                      </div>

                      {/* Right: Action */}
                      <div className="flex-1 flex flex-col justify-center items-end border-l border-white/5 pl-6">
                           <button 
                                onClick={handleMagicMatch}
                                disabled={isMagicMatching || bankTransactions.length === 0}
                                className={`w-full py-4 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all ${
                                    bankTransactions.length > 0 && receipts.length > 0 
                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white animate-pulse-slow' 
                                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                }`}
                            >
                                {isMagicMatching ? <Loader2 className="w-5 h-5 animate-spin"/> : <Wand2 className="w-5 h-5" />}
                                {isMagicMatching ? "Reconciling..." : "Run Auto-Reconcile"}
                            </button>
                            <p className="text-[10px] text-zinc-500 mt-2 text-center w-full leading-tight">
                                1. Exact Match (Rules)<br/>2. AI Fuzzy Match
                            </p>
                      </div>
                  </div>
              </div>
              
              {/* Toolbar */}
              <div className="flex justify-between items-center bg-zinc-900/30 p-2 rounded-2xl border border-white/5 backdrop-blur-md">
                   <div className="flex gap-2">
                       <div className="bg-black/40 p-1 rounded-xl border border-white/5 flex gap-1">
                           <button onClick={() => setReconcileView('split')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${reconcileView === 'split' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}><SplitSquareVertical className="w-4 h-4" /> Split View</button>
                           <button onClick={() => setReconcileView('unified')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${reconcileView === 'unified' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}><Table className="w-4 h-4" /> Unified Report</button>
                           <button onClick={() => setReconcileView('analytics')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${reconcileView === 'analytics' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}><BarChart3 className="w-4 h-4" /> Insights</button>
                       </div>
                       
                       <div className="h-8 w-px bg-white/10 mx-2"></div>

                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 gap-1">
                           <button onClick={() => setReconcileFilter('all')} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${reconcileFilter === 'all' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>All</button>
                           <button onClick={() => setReconcileFilter('unmatched')} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${reconcileFilter === 'unmatched' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Unmatched</button>
                           <button onClick={() => setReconcileFilter('matched')} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${reconcileFilter === 'matched' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Matched</button>
                        </div>
                   </div>
              </div>

              {/* Main Workspace */}
              {reconcileView === 'analytics' ? (
                  <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl animate-in fade-in">
                      <div className="grid grid-cols-2 gap-8 h-80">
                          <div>
                              <h4 className="text-sm font-bold text-white mb-4">Reconciled Expenses by Category</h4>
                              <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={reconciliationAnalytics.reconciledByCategory} layout="vertical">
                                      <XAxis type="number" hide />
                                      <YAxis dataKey="name" type="category" width={100} tick={{fill:'#a1a1aa', fontSize: 11}} />
                                      <Tooltip contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a'}} />
                                      <Bar dataKey="value" fill="#10b981" radius={[0,4,4,0]} barSize={24} />
                                  </BarChart>
                              </ResponsiveContainer>
                          </div>
                          <div>
                              <h4 className="text-sm font-bold text-white mb-4">Reconciliation Coverage</h4>
                              <div className="flex flex-col gap-4">
                                  <div className="bg-zinc-800 p-4 rounded-xl border border-zinc-700">
                                      <div className="text-xs text-zinc-400">Total Transactions</div>
                                      <div className="text-2xl text-white font-bold">{reconciliationStats.totalTx}</div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                      <div className="bg-emerald-900/20 p-3 rounded-lg border border-emerald-500/20 text-center">
                                          <div className="text-xs text-emerald-400 font-bold mb-1">Exact</div>
                                          <div className="text-xl text-white">{reconciliationStats.exactMatches}</div>
                                      </div>
                                      <div className="bg-purple-900/20 p-3 rounded-lg border border-purple-500/20 text-center">
                                          <div className="text-xs text-purple-400 font-bold mb-1">AI</div>
                                          <div className="text-xl text-white">{reconciliationStats.aiMatches}</div>
                                      </div>
                                      <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-500/20 text-center">
                                          <div className="text-xs text-blue-400 font-bold mb-1">Manual</div>
                                          <div className="text-xl text-white">{reconciliationStats.manualMatches}</div>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
              ) : reconcileView === 'split' ? (
                  <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 relative">
                      {/* Left: Bank Feed */}
                      <div className="flex-1 bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                              <h3 className="font-semibold text-white flex items-center gap-2"><ArrowRight className="w-4 h-4 text-emerald-400" /> Bank Feed</h3>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                              {bankTransactions.length === 0 && !isBankAnalyzing && (
                                  <div className="text-center p-10 text-zinc-500">
                                      <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                                      <p>No transactions yet</p>
                                  </div>
                              )}
                              {isBankAnalyzing && (
                                  <div className="flex flex-col items-center justify-center h-40 gap-4">
                                      <Loader2 className="w-8 h-8 animate-spin text-emerald-500"/>
                                      <p className="text-emerald-400 text-sm animate-pulse">Analyzing Bank Statement...</p>
                                  </div>
                              )}
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
                                                  <div className="flex gap-3 text-xs mt-1">
                                                      <span className="text-zinc-500 font-mono">{tx.date}</span>
                                                      {tx.sourceFile && <span className="text-zinc-600 truncate max-w-[100px]" title={tx.sourceFile}>{tx.sourceFile}</span>}
                                                  </div>
                                              </div>
                                              <div className="text-right">
                                                  <p className={`font-mono text-sm font-bold ${tx.amount > 0 ? 'text-emerald-400' : 'text-white'}`}>{tx.amount.toFixed(2)} {tx.currency}</p>
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
                                                  <button onClick={() => setSelectedReceipt(r)} className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline mt-1">View Details</button>
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
                  // Unified Report View
                  <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl flex-1 overflow-hidden flex flex-col shadow-2xl animate-in fade-in">
                       <div className="overflow-auto flex-1 custom-scrollbar">
                          <table className="w-full text-left text-sm border-collapse">
                              <thead className="bg-zinc-900/90 text-zinc-500 sticky top-0 z-10 font-bold uppercase text-xs tracking-wider backdrop-blur-md shadow-sm">
                                  <tr>
                                      <th className="p-4 border-b border-white/5">Status</th>
                                      <th className="p-4 border-b border-white/5 bg-zinc-900/50">Date</th>
                                      <th className="p-4 border-b border-white/5 bg-zinc-900/50">Bank Desc</th>
                                      <th className="p-4 border-b border-white/5 bg-zinc-900/50 text-right">Bank Amt</th>
                                      <th className="p-4 border-b border-white/5 border-l border-white/5 bg-indigo-900/10 text-indigo-300/70">Receipt</th>
                                      <th className="p-4 border-b border-white/5 bg-indigo-900/10 text-indigo-300/70 text-right">Rcpt Amt</th>
                                      <th className="p-4 border-b border-white/5 border-l border-white/5 text-right">Variance</th>
                                      <th className="p-4 border-b border-white/5 w-24">Source</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {unifiedReportData.map((row, idx) => (
                                      <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                          <td className="p-4 align-middle">
                                              <div className="flex flex-col items-center gap-1">
                                                {row.status === 'MATCHED' && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                                                {row.status === 'MISSING_RECEIPT' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                                                {row.status === 'INCOME' && <Plus className="w-4 h-4 text-indigo-400" />}
                                                {row.matchType && renderMatchBadge(row.matchType)}
                                              </div>
                                          </td>
                                          <td className="p-4 bg-zinc-900/20 font-mono text-zinc-400 text-xs">{row.date}</td>
                                          <td className="p-4 bg-zinc-900/20 text-zinc-300 max-w-[200px] truncate font-medium" title={row.bankDesc}>{row.bankDesc || '-'}</td>
                                          <td className="p-4 bg-zinc-900/20 text-right font-mono text-zinc-300">{row.bankAmount ? row.bankAmount.toFixed(2) : '-'} <span className="text-[10px] text-zinc-600">{row.bankCurrency}</span></td>
                                          
                                          <td className="p-4 border-l border-white/5 bg-indigo-900/5 text-indigo-200 font-medium">{row.receiptVendor || '-'}</td>
                                          <td className="p-4 bg-indigo-900/5 text-right font-mono text-indigo-200">{row.receiptAmount ? row.receiptAmount.toFixed(2) : '-'} <span className="text-[10px] text-indigo-300/50">{row.receiptCurrency}</span></td>
                                          
                                          <td className="p-4 border-l border-white/5 text-right font-mono font-bold">
                                              {row.variance && parseFloat(row.variance) !== 0 ? (
                                                  <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">{row.variance}</span>
                                              ) : row.status === 'MATCHED' ? (
                                                  <span className="text-emerald-500/50">0.00</span>
                                              ) : '-'}
                                          </td>
                                          
                                          <td className="p-4 text-xs text-zinc-600 truncate max-w-[100px]" title={row.bankSource}>
                                              {row.bankSource || '-'}
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
