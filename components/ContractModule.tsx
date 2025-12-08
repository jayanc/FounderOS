
import React, { useState, useRef, useEffect } from 'react';
import { ContractData, ContractCategory, ViewState } from '../types';
import { analyzeContract, queryContractData } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { Upload, FileText, Search, Loader2, Calendar, Users, AlertTriangle, MessageSquare, Briefcase, User, Building2, Globe, Eye, X, ZoomIn, CheckCircle2, History, Pencil, Save, Camera } from 'lucide-react';

interface ContractModuleProps {
    onOpenCapture?: () => void;
}

export const ContractModule: React.FC<ContractModuleProps> = ({ onOpenCapture }) => {
    const [contracts, setContracts] = useState<ContractData[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [uploadCategory, setUploadCategory] = useState<ContractCategory>('Customer');
    const [query, setQuery] = useState('');
    const [answer, setAnswer] = useState('');
    const [isQuerying, setIsQuerying] = useState(false);
    const [selectedContract, setSelectedContract] = useState<ContractData | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    
    // History State
    const [showHistory, setShowHistory] = useState(false);
    const [historyLogs, setHistoryLogs] = useState(storageService.getHistory(ViewState.CONTRACTS));

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Persistence
    useEffect(() => {
        const load = async () => {
            const data = await storageService.load<ContractData>('founder_os_contracts');
            if(data) setContracts(data);
        };
        load();
    }, []);

    useEffect(() => {
        storageService.save('founder_os_contracts', contracts);
    }, [contracts]);

    const refreshHistory = () => {
        setHistoryLogs(storageService.getHistory(ViewState.CONTRACTS));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsAnalyzing(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const analysis = await analyzeContract(base64, file.type);
                
                const newContract: ContractData = {
                    ...analysis,
                    id: crypto.randomUUID(),
                    name: file.name,
                    category: uploadCategory,
                    imageUrl: file.type.startsWith('image/') ? (reader.result as string) : undefined,
                    status: 'Review'
                };
                setContracts(prev => [newContract, ...prev]);
                setSelectedContract(newContract);
                storageService.logActivity(ViewState.CONTRACTS, 'IMPORT', `Uploaded contract ${file.name}`);
                refreshHistory();
            };
            reader.readAsDataURL(file);
        } catch (err) {
            alert("Contract analysis failed.");
        } finally {
            setIsAnalyzing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleUpdateContract = (field: keyof ContractData, value: any) => {
        if (!selectedContract) return;
        const updated = { ...selectedContract, [field]: value };
        setSelectedContract(updated);
        setContracts(prev => prev.map(c => c.id === updated.id ? updated : c));
    };

    const handleValidate = () => {
        if (!selectedContract) return;
        handleUpdateContract('status', 'Validated');
        setIsEditMode(false);
        storageService.logActivity(ViewState.CONTRACTS, 'EDIT', `Validated contract ${selectedContract.name}`);
        refreshHistory();
    };

    const handleAskLegalBrain = async () => {
        if (!query) return;
        setIsQuerying(true);
        try {
            const result = await queryContractData(contracts, query);
            setAnswer(result);
        } catch (e) {
            setAnswer("Could not query contracts.");
        } finally {
            setIsQuerying(false);
        }
    };

    const getCategoryIcon = (cat: ContractCategory) => {
        switch(cat) {
            case 'Employee': return <User className="w-4 h-4" />;
            case 'Customer': return <Briefcase className="w-4 h-4" />;
            case 'Partner': return <Globe className="w-4 h-4" />;
            case 'Consultant': return <Building2 className="w-4 h-4" />;
        }
    };

    return (
        <div className="flex flex-col h-full gap-8 relative">
            <header className="flex justify-between items-end border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Contract Vault</h2>
                    <p className="text-zinc-400 mt-2 font-light">Centralized legal document storage & analysis.</p>
                </div>
                <div className="flex gap-3">
                     <button 
                        onClick={() => setShowHistory(!showHistory)} 
                        className={`p-2.5 rounded-xl border transition-colors ${showHistory ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-transparent border-transparent text-zinc-500 hover:text-white'}`}
                        title="View History"
                    >
                        <History className="w-5 h-5" />
                    </button>
                     <select 
                        value={uploadCategory} 
                        onChange={(e) => setUploadCategory(e.target.value as ContractCategory)}
                        className="bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                     >
                         <option value="Customer">Customer</option>
                         <option value="Employee">Employee</option>
                         <option value="Consultant">Consultant</option>
                         <option value="Partner">Partner</option>
                     </select>
                    {onOpenCapture && (
                        <button onClick={onOpenCapture} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors bg-zinc-900" title="Capture Snapshot">
                            <Camera className="w-5 h-5" />
                        </button>
                    )}
                    <button onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all">
                        {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4" />}
                        Upload Contract
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.docx,.txt,.jpg,.png,.jpeg,.webp" onChange={handleFileUpload} />
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-8 h-full min-h-0 relative">
                
                {/* History Drawer */}
                {showHistory && (
                    <div className="absolute top-0 right-0 z-20 w-80 h-full bg-zinc-950/95 backdrop-blur-xl border-l border-white/10 shadow-2xl p-6 animate-in slide-in-from-right-4 duration-300 overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-white font-bold flex items-center gap-2"><History className="w-4 h-4 text-indigo-400"/> Legal Audit Log</h3>
                            <button onClick={() => setShowHistory(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4"/></button>
                        </div>
                        <div className="space-y-6 relative border-l border-zinc-800 ml-2">
                            {historyLogs.map(log => (
                                <div key={log.id} className="ml-6 relative">
                                    <div className={`absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${log.action === 'IMPORT' ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                                    <p className="text-xs text-zinc-500 font-mono mb-1">{new Date(log.timestamp).toLocaleString()}</p>
                                    <p className="text-sm text-zinc-300 font-medium">{log.action}</p>
                                    <p className="text-xs text-zinc-400 mt-1">{log.details}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Contract List */}
                <div className={`${selectedContract ? 'hidden lg:block lg:w-1/3' : 'flex-1'} overflow-y-auto custom-scrollbar pr-2 transition-all`}>
                    <div className="grid grid-cols-1 gap-4">
                        {contracts.map(contract => (
                            <div 
                                key={contract.id} 
                                onClick={() => setSelectedContract(contract)}
                                className={`bg-zinc-900/40 backdrop-blur-xl border rounded-2xl p-5 cursor-pointer transition-all group ${selectedContract?.id === contract.id ? 'border-indigo-500 bg-indigo-500/5' : 'border-white/5 hover:bg-zinc-900/60'}`}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                                        {getCategoryIcon(contract.category)}
                                        {contract.category}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {contract.status === 'Validated' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                        <span className="text-xs text-zinc-500 font-mono">{new Date(contract.uploadDate).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <h3 className="text-white font-semibold text-lg truncate mb-2" title={contract.name}>{contract.name}</h3>
                                <p className="text-zinc-400 text-sm line-clamp-2 mb-4 h-10 leading-relaxed">{contract.summary}</p>
                                
                                <div className="flex gap-2">
                                    {contract.keyConstraints.slice(0, 2).map((tag, i) => (
                                        <span key={i} className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-1 rounded-md border border-zinc-700 truncate max-w-[120px]">{tag}</span>
                                    ))}
                                    {contract.keyConstraints.length > 2 && <span className="text-[10px] text-zinc-500 px-1 py-1">+{contract.keyConstraints.length - 2} more</span>}
                                </div>
                            </div>
                        ))}
                        {contracts.length === 0 && (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-500 gap-4 border-2 border-dashed border-zinc-800 rounded-3xl bg-black/20">
                                <FileText className="w-12 h-12 opacity-20" />
                                <p>No contracts uploaded yet.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Detailed View / Chat */}
                <div className={`${selectedContract ? 'flex-1' : 'w-full lg:w-[400px]'} bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl flex flex-col shadow-xl h-full transition-all overflow-hidden`}>
                    
                    {selectedContract ? (
                        <div className="flex flex-col h-full">
                            {/* Toolbar */}
                            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/20">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <button onClick={() => setSelectedContract(null)} className="lg:hidden p-2 hover:bg-white/10 rounded-lg text-zinc-400"><X className="w-4 h-4" /></button>
                                    <h3 className="font-bold text-white truncate">{selectedContract.name}</h3>
                                    {selectedContract.status === 'Validated' && <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Validated</span>}
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setIsEditMode(!isEditMode)} 
                                        className={`p-2 rounded-lg transition-colors ${isEditMode ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                                    >
                                        {isEditMode ? <Save className="w-4 h-4"/> : <Pencil className="w-4 h-4"/>}
                                    </button>
                                    <button onClick={() => setSelectedContract(null)} className="hidden lg:block p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><X className="w-4 h-4"/></button>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col lg:flex-row min-h-0">
                                {/* Left: Document Viewer */}
                                <div className="flex-1 bg-black/40 flex items-center justify-center p-4 border-b lg:border-b-0 lg:border-r border-white/5 overflow-hidden relative group">
                                    {selectedContract.imageUrl ? (
                                        <img src={selectedContract.imageUrl} alt="Contract" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
                                    ) : (
                                        <div className="text-center text-zinc-500">
                                            <FileText className="w-20 h-20 mx-auto mb-4 opacity-20" />
                                            <p>Preview not available for text/pdf files yet.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Right: Analysis Panel */}
                                <div className="w-full lg:w-96 bg-zinc-900/60 p-6 overflow-y-auto custom-scrollbar space-y-6">
                                    <div>
                                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Summary</h4>
                                        {isEditMode ? (
                                            <textarea 
                                                value={selectedContract.summary} 
                                                onChange={(e) => handleUpdateContract('summary', e.target.value)}
                                                className="w-full h-32 bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                                            />
                                        ) : (
                                            <p className="text-sm text-zinc-300 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">{selectedContract.summary}</p>
                                        )}
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Key Constraints</h4>
                                        <div className="flex flex-col gap-2">
                                            {selectedContract.keyConstraints.map((constraint, i) => (
                                                <div key={i} className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg w-full">
                                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                                    {isEditMode ? (
                                                        <input 
                                                            value={constraint} 
                                                            onChange={(e) => {
                                                                const newConstraints = [...selectedContract.keyConstraints];
                                                                newConstraints[i] = e.target.value;
                                                                handleUpdateContract('keyConstraints', newConstraints);
                                                            }}
                                                            className="bg-transparent border-b border-amber-500/30 text-xs text-amber-100 w-full focus:outline-none"
                                                        />
                                                    ) : (
                                                        <span className="text-xs text-amber-100">{constraint}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                            <span className="text-[10px] text-zinc-500 uppercase font-bold">Expiration</span>
                                            <div className="flex items-center gap-2 mt-1 text-white text-sm font-mono">
                                                <Calendar className="w-4 h-4 text-indigo-400" />
                                                {isEditMode ? (
                                                    <input 
                                                        type="date" 
                                                        value={selectedContract.expirationDate || ''} 
                                                        onChange={(e) => handleUpdateContract('expirationDate', e.target.value)}
                                                        className="bg-zinc-900 rounded px-1 py-0.5 text-xs border border-zinc-700 w-full" 
                                                    />
                                                ) : (selectedContract.expirationDate || 'N/A')}
                                            </div>
                                        </div>
                                        <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                            <span className="text-[10px] text-zinc-500 uppercase font-bold">Parties</span>
                                            <div className="flex items-center gap-2 mt-1 text-white text-sm">
                                                <Users className="w-4 h-4 text-emerald-400" />
                                                {selectedContract.parties.length} Entities
                                            </div>
                                        </div>
                                    </div>

                                    {isEditMode && (
                                        <button onClick={handleValidate} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" /> Save & Validate
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full p-6">
                            <div className="mb-auto">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2"><MessageSquare className="w-5 h-5 text-indigo-400"/> Legal Brain</h3>
                                <p className="text-xs text-zinc-400 mt-1">Ask questions across all your contracts.</p>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-4 mb-4 custom-scrollbar">
                                {answer ? (
                                    <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-lg p-3">
                                        <p className="text-sm text-indigo-100 whitespace-pre-wrap leading-relaxed">{answer}</p>
                                    </div>
                                ) : (
                                    <div className="text-center text-zinc-600 text-sm py-10 px-4">
                                        "Which contracts expire in Q4?"<br/>
                                        "What are the termination clauses?"
                                    </div>
                                )}
                            </div>

                            <div className="relative">
                                <textarea 
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Ask a question..."
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 pr-12 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none h-20"
                                    onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAskLegalBrain(); } }}
                                />
                                <button 
                                    onClick={handleAskLegalBrain}
                                    disabled={isQuerying || !query}
                                    className="absolute bottom-3 right-3 p-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white disabled:opacity-50 transition-colors"
                                >
                                    {isQuerying ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4"/>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
