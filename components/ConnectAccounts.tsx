
import React, { useState, useRef } from 'react';
import { IntegrationAccount, IntegrationType, ApiConfig, ReceiptData, ActionItem, CalendarEvent, AppSettings } from '../types';
import { Mail, RefreshCw, Plus, ShieldCheck, HardDrive, FolderOpen, UploadCloud, X, Check, Lock, Terminal, Settings, Download, Trash2, Database, Save, CloudLightning, Globe, DollarSign, Languages, FileText, Image as ImageIcon, LayoutTemplate, Loader2, Building2, Stamp, CreditCard, Server, Upload } from 'lucide-react';
import { securityService } from '../services/securityService';
import { storageService } from '../services/storageService';

interface ConnectAccountsProps {
  accounts: IntegrationAccount[];
  onToggleAccount: (id: string) => void;
  onAddAccount: (account: IntegrationAccount) => void;
  // Data props for export
  receipts: ReceiptData[];
  tasks: ActionItem[];
  events: CalendarEvent[];
  onClearData: () => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
}

export const ConnectAccounts: React.FC<ConnectAccountsProps> = ({ accounts, onToggleAccount, onAddAccount, receipts, tasks, events, onClearData, settings, onUpdateSettings }) => {
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  
  // Form State
  const [newAccountType, setNewAccountType] = useState<IntegrationType>('GDrive');
  const [newAccountName, setNewAccountName] = useState('');
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [clientId, setClientId] = useState('');

  const logoRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);

  const handleToggle = (id: string) => {
    if (!accounts.find(a => a.id === id)?.isConnected) {
        setConnectingId(id);
        setTimeout(() => {
            onToggleAccount(id);
            setConnectingId(null);
        }, 1200);
    } else {
        onToggleAccount(id);
    }
  };

  const handleSaveNewAccount = async () => {
      if (!newAccountName) return;
      
      // Encrypt API keys before storing
      let encryptedApiKey = undefined;
      if (apiKey) encryptedApiKey = await securityService.encrypt(apiKey);

      const apiConfig: ApiConfig = {
          clientId: clientId || undefined,
          apiKey: encryptedApiKey,
          scope: newAccountType === 'Gmail' 
            ? 'https://www.googleapis.com/auth/gmail.readonly' 
            : 'https://www.googleapis.com/auth/drive.readonly'
      };

      const newAccount: IntegrationAccount = {
          id: crypto.randomUUID(),
          name: newAccountName,
          provider: newAccountType,
          isConnected: true,
          type: 'Work',
          apiConfig
      };
      
      onAddAccount(newAccount);
      
      // Reset Form
      setIsAdding(false);
      setNewAccountName('');
      setApiKey('');
      setClientId('');
      setShowApiConfig(false);
  };

  const handleExportData = async () => {
      setIsExporting(true);
      try {
          const exportJson = await storageService.exportAllData();
          const blob = new Blob([exportJson], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `FounderOS_Global_Backup_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } catch (e) {
          alert("Export failed.");
          console.error(e);
      } finally {
          setIsExporting(false);
      }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (confirm("Warning: Importing a backup will overwrite existing local data. Continue?")) {
          try {
              const text = await file.text();
              const success = await storageService.importAllData(text);
              if (success) {
                  alert("Import successful. Reloading...");
                  window.location.reload();
              } else {
                  alert("Import failed. Invalid file structure.");
              }
          } catch(e) {
              alert("Error reading file.");
          }
      }
      if (importRef.current) importRef.current.value = '';
  };

  const handleUpdateGCPConfig = (field: keyof NonNullable<AppSettings['gcpConfig']>, value: any) => {
      const currentConfig = settings.gcpConfig || { bucketName: '', projectId: '', autoSync: false };
      const newConfig = { ...currentConfig, [field]: value };
      onUpdateSettings({ ...settings, gcpConfig: newConfig });
      // Re-configure storage service dynamically
      // In real app, might need a cleaner way to re-init service
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'signatureUrl') => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
          onUpdateSettings({ ...settings, [field]: reader.result as string });
      };
      reader.readAsDataURL(file);
  };

  const getIcon = (provider: string, isConnected: boolean) => {
      const className = `w-6 h-6 ${isConnected ? 'text-green-400' : 'text-zinc-400'}`;
      switch(provider) {
          case 'Gmail': return <Mail className={className} />;
          case 'GDrive': return <UploadCloud className={className} />;
          case 'Local': return <HardDrive className={className} />;
          default: return <FolderOpen className={className} />;
      }
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8 relative pb-20">
      <header>
         <h2 className="text-2xl font-bold text-white mb-2">Settings & Integrations</h2>
         <p className="text-zinc-400">Configure global preferences, data sources, and system controls.</p>
      </header>

      {/* Global Preferences Section */}
      <div>
          <h3 className="text-lg font-semibold text-zinc-300 mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5" /> Global Preferences
          </h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-2 flex items-center gap-2">
                      <Languages className="w-3 h-3" /> App Language
                  </label>
                  <select 
                      value={settings.language}
                      onChange={(e) => onUpdateSettings({ ...settings, language: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                      <option value="English">English</option>
                      <option value="Spanish">Español</option>
                      <option value="French">Français</option>
                      <option value="German">Deutsch</option>
                      <option value="Swedish">Svenska</option>
                  </select>
              </div>
              
              <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-2 flex items-center gap-2">
                      <Globe className="w-3 h-3" /> App Country / Region
                  </label>
                  <select 
                      value={settings.country}
                      onChange={(e) => onUpdateSettings({ ...settings, country: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                      <option value="United States">United States</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="European Union">European Union</option>
                      <option value="Sweden">Sweden</option>
                      <option value="Canada">Canada</option>
                      <option value="Australia">Australia</option>
                  </select>
              </div>

              <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-2 flex items-center gap-2">
                      <DollarSign className="w-3 h-3" /> Reporting Currency
                  </label>
                  <select 
                      value={settings.currency}
                      onChange={(e) => onUpdateSettings({ ...settings, currency: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="SEK">SEK (kr)</option>
                      <option value="CAD">CAD ($)</option>
                      <option value="AUD">AUD ($)</option>
                  </select>
              </div>
          </div>
      </div>

      {/* Cloud Infrastructure Configuration */}
      <div>
          <h3 className="text-lg font-semibold text-zinc-300 mb-4 flex items-center gap-2">
              <Server className="w-5 h-5" /> Cloud Storage Infrastructure
          </h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-indigo-500/10 rounded-lg">
                      <UploadCloud className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                      <h4 className="text-white font-medium">Google Cloud Storage (GCS)</h4>
                      <p className="text-xs text-zinc-500">Configure central bucket for data synchronization.</p>
                  </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Project ID</label>
                      <input 
                          type="text"
                          value={settings.gcpConfig?.projectId || ''}
                          onChange={(e) => handleUpdateGCPConfig('projectId', e.target.value)}
                          placeholder="my-gcp-project-id"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Bucket Name</label>
                      <input 
                          type="text"
                          value={settings.gcpConfig?.bucketName || ''}
                          onChange={(e) => handleUpdateGCPConfig('bucketName', e.target.value)}
                          placeholder="founder-os-central-storage"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                  </div>
              </div>
              
              <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4">
                  <div className="flex items-center gap-3">
                      <div onClick={() => handleUpdateGCPConfig('autoSync', !settings.gcpConfig?.autoSync)} className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${settings.gcpConfig?.autoSync ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settings.gcpConfig?.autoSync ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-sm text-zinc-300">Enable Cloud Auto-Sync</span>
                  </div>
                  {settings.gcpConfig?.autoSync && (
                      <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                          Active • Syncing to gs://{settings.gcpConfig.bucketName}
                      </span>
                  )}
              </div>
          </div>
      </div>

      {/* Global Branding Config */}
      <div>
          <h3 className="text-lg font-semibold text-zinc-300 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5" /> Company Identity (Global)
          </h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
              <p className="text-xs text-zinc-500">These details will be used by default across your Invoice Templates.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">Company Name</label>
                          <input 
                              type="text"
                              value={settings.companyName || ''}
                              onChange={(e) => onUpdateSettings({...settings, companyName: e.target.value})}
                              placeholder="Acme Corp LLC"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">Company Address</label>
                          <textarea 
                              value={settings.companyAddress || ''}
                              onChange={(e) => onUpdateSettings({...settings, companyAddress: e.target.value})}
                              placeholder="123 Innovation Dr..."
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 h-24 resize-none"
                          />
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div 
                          onClick={() => logoRef.current?.click()}
                          className="border border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors overflow-hidden relative h-40 bg-zinc-950"
                      >
                          {settings.logoUrl ? (
                              <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain p-4" />
                          ) : (
                              <div className="text-center text-zinc-500">
                                  <ImageIcon className="w-6 h-6 mx-auto mb-2" />
                                  <span className="text-xs">Upload Global Logo</span>
                              </div>
                          )}
                          <input type="file" ref={logoRef} className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'logoUrl')} />
                          {settings.logoUrl && <button onClick={(e) => {e.stopPropagation(); onUpdateSettings({...settings, logoUrl: undefined})}} className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white"><X className="w-3 h-3"/></button>}
                      </div>

                      <div 
                          onClick={() => sigRef.current?.click()}
                          className="border border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors overflow-hidden relative h-40 bg-zinc-950"
                      >
                          {settings.signatureUrl ? (
                              <img src={settings.signatureUrl} alt="Sig" className="w-full h-full object-contain p-4" />
                          ) : (
                              <div className="text-center text-zinc-500">
                                  <FileText className="w-6 h-6 mx-auto mb-2" />
                                  <span className="text-xs">Upload Signature</span>
                              </div>
                          )}
                          <input type="file" ref={sigRef} className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'signatureUrl')} />
                          {settings.signatureUrl && <button onClick={(e) => {e.stopPropagation(); onUpdateSettings({...settings, signatureUrl: undefined})}} className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white"><X className="w-3 h-3"/></button>}
                      </div>
                  </div>
              </div>

              {/* Business Registration Details */}
              <div className="border-t border-zinc-800 pt-6 mt-6">
                  <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Stamp className="w-4 h-4 text-indigo-400" /> Business Registration Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">Organization Number (Org.nr)</label>
                          <input 
                              type="text"
                              value={settings.orgNumber || ''}
                              onChange={(e) => onUpdateSettings({...settings, orgNumber: e.target.value})}
                              placeholder="556000-0000"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">VAT / Moms Reg. Number</label>
                          <input 
                              type="text"
                              value={settings.vatNumber || ''}
                              onChange={(e) => onUpdateSettings({...settings, vatNumber: e.target.value})}
                              placeholder="SE556000000001"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">F-skatt Status</label>
                          <input 
                              type="text"
                              value={settings.fSkattStatus || ''}
                              onChange={(e) => onUpdateSettings({...settings, fSkattStatus: e.target.value})}
                              placeholder="Godkänd för F-skatt"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                      </div>
                  </div>
              </div>

              {/* Payment Details */}
              <div className="border-t border-zinc-800 pt-6 mt-6">
                  <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-400" /> Payment Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">Bankgiro</label>
                          <input 
                              type="text"
                              value={settings.bankgiro || ''}
                              onChange={(e) => onUpdateSettings({...settings, bankgiro: e.target.value})}
                              placeholder="123-4567"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">PlusGiro</label>
                          <input 
                              type="text"
                              value={settings.plusgiro || ''}
                              onChange={(e) => onUpdateSettings({...settings, plusgiro: e.target.value})}
                              placeholder="12 34 56-7"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">Swish</label>
                          <input 
                              type="text"
                              value={settings.swish || ''}
                              onChange={(e) => onUpdateSettings({...settings, swish: e.target.value})}
                              placeholder="123 123 12 12"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                      </div>
                      <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-zinc-500 mb-1">IBAN</label>
                          <input 
                              type="text"
                              value={settings.iban || ''}
                              onChange={(e) => onUpdateSettings({...settings, iban: e.target.value})}
                              placeholder="SE00 0000 0000 0000 0000 0000"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1">BIC / SWIFT</label>
                          <input 
                              type="text"
                              value={settings.bic || ''}
                              onChange={(e) => onUpdateSettings({...settings, bic: e.target.value})}
                              placeholder="BANKSEHH"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                          />
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* Cloud & Email Section */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <UploadCloud className="w-5 h-5" /> Cloud & Email Integrations
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.filter(a => a.provider !== 'Local').map(account => (
                <div key={account.id} className={`p-6 rounded-2xl border transition-all ${account.isConnected ? 'bg-zinc-900/50 border-green-500/30' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-zinc-800 rounded-xl">
                            {getIcon(account.provider, account.isConnected)}
                        </div>
                        {account.isConnected && (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                                <ShieldCheck className="w-3 h-3" /> Active
                            </span>
                        )}
                    </div>
                    
                    <h3 className="text-lg font-semibold text-white mb-1 truncate" title={account.name}>{account.name}</h3>
                    <p className="text-sm text-zinc-500 mb-6 flex items-center gap-2">
                        {account.provider} • {account.type}
                        {account.apiConfig?.clientId && <span title="Custom API Configured" className="text-indigo-400"><Terminal className="w-3 h-3" /></span>}
                    </p>
                    
                    <button
                        onClick={() => handleToggle(account.id)}
                        disabled={connectingId === account.id}
                        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                            account.isConnected 
                            ? 'bg-zinc-800 hover:bg-red-500/10 hover:text-red-400 text-zinc-300 border border-zinc-700' 
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                        }`}
                    >
                        {connectingId === account.id ? (
                            <><RefreshCw className="w-4 h-4 animate-spin" /> Authenticating...</>
                        ) : account.isConnected ? (
                            "Disconnect"
                        ) : (
                            "Connect"
                        )}
                    </button>
                </div>
            ))}
             <button 
                onClick={() => setIsAdding(true)}
                className="p-6 rounded-2xl border border-dashed border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all flex flex-col items-center justify-center gap-3 text-zinc-500 hover:text-zinc-300"
            >
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center">
                    <Plus className="w-6 h-6" />
                </div>
                <span className="font-medium">Add New Source</span>
            </button>
        </div>
      </div>

      {/* Local Section */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <HardDrive className="w-5 h-5" /> Local Watch Folders
        </h3>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
             {accounts.filter(a => a.provider === 'Local').map(account => (
                 <div key={account.id} className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-xl mb-2">
                     <div className="flex items-center gap-4">
                        <div className="p-2 bg-zinc-800 rounded-lg">
                            <FolderOpen className="w-5 h-5 text-zinc-400" />
                        </div>
                        <div>
                             <h4 className="text-white font-medium">{account.name}</h4>
                             <p className="text-xs text-zinc-500">Watching for PDF, JPG, PNG</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-4">
                        <span className={`text-xs ${account.isConnected ? 'text-green-400' : 'text-zinc-500'}`}>
                            {account.isConnected ? 'Monitoring' : 'Paused'}
                        </span>
                        <div 
                            onClick={() => handleToggle(account.id)}
                            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${account.isConnected ? 'bg-indigo-600' : 'bg-zinc-700'}`}
                        >
                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${account.isConnected ? 'translate-x-6' : 'translate-x-0'}`} />
                        </div>
                     </div>
                 </div>
             ))}
        </div>
      </div>

      {/* Data Sovereignty Section */}
      <div>
         <h3 className="text-lg font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5" /> Data Control & Sovereignty
         </h3>
         <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-4">
                 <div>
                    <h4 className="text-white font-medium mb-1">Backup & Restore</h4>
                    <p className="text-sm text-zinc-500 mb-4">You own your data. Save a backup locally or to your cloud provider.</p>
                 </div>
                 
                 <div className="flex flex-col gap-3">
                    <button onClick={handleExportData} disabled={isExporting} className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-between gap-2 text-sm transition-colors border border-zinc-700 group">
                        <span className="flex items-center gap-2">
                            {isExporting ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4" />} 
                            Download Full System Backup
                        </span>
                        <span className="text-zinc-500 text-xs group-hover:text-zinc-400">JSON</span>
                    </button>
                    
                    <button onClick={() => importRef.current?.click()} className="px-4 py-3 bg-zinc-900/30 hover:bg-zinc-900/50 text-indigo-200 border border-indigo-500/30 rounded-xl flex items-center justify-between gap-2 text-sm transition-colors">
                        <span className="flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            Import / Restore Backup
                        </span>
                        <span className="text-indigo-400/70 text-xs">Overwrite All</span>
                    </button>
                    <input type="file" ref={importRef} className="hidden" accept=".json" onChange={handleImportData} />
                 </div>
             </div>
             
             <div>
                 <h4 className="text-white font-medium mb-1">Danger Zone</h4>
                 <p className="text-sm text-zinc-500 mb-4">Permanently delete all local data and reset the application state.</p>
                 {!showClearConfirm ? (
                     <button onClick={() => setShowClearConfirm(true)} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg flex items-center gap-2 text-sm transition-colors border border-red-500/20">
                         <Trash2 className="w-4 h-4" /> Clear All Data
                     </button>
                 ) : (
                     <div className="flex items-center gap-2 animate-in fade-in">
                         <button onClick={() => setShowClearConfirm(false)} className="px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm">Cancel</button>
                         <button onClick={onClearData} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-red-600/20">
                             Confirm Delete
                         </button>
                     </div>
                 )}
             </div>
         </div>
      </div>

      {/* Add New Source Modal */}
      {isAdding && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-3xl animate-in fade-in duration-200">
              <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white">Add Data Source</h3>
                      <button onClick={() => setIsAdding(false)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
                  </div>
                  
                  <div className="space-y-4">
                      {/* Provider Selection */}
                      <div>
                          <label className="block text-sm font-medium text-zinc-400 mb-2">Source Type</label>
                          <div className="grid grid-cols-3 gap-2">
                              {['Gmail', 'GDrive', 'Local'].map((type) => (
                                  <button
                                    key={type}
                                    onClick={() => setNewAccountType(type as IntegrationType)}
                                    className={`px-3 py-3 rounded-xl text-sm font-medium border transition-colors flex flex-col items-center gap-2 ${newAccountType === type ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}
                                  >
                                      {type === 'Gmail' && <Mail className="w-5 h-5" />}
                                      {type === 'GDrive' && <UploadCloud className="w-5 h-5" />}
                                      {type === 'Local' && <HardDrive className="w-5 h-5" />}
                                      <span>{type === 'GDrive' ? 'Drive' : type}</span>
                                  </button>
                              ))}
                          </div>
                      </div>

                      {/* Name Input */}
                      <div>
                          <label className="block text-sm font-medium text-zinc-400 mb-2">
                              {newAccountType === 'Gmail' ? 'Email Address' : newAccountType === 'GDrive' ? 'Folder Name' : 'Local Path'}
                          </label>
                          <input 
                            type="text" 
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                            placeholder={newAccountType === 'Gmail' ? 'team@company.com' : newAccountType === 'GDrive' ? 'Finance/2024/Receipts' : '/Users/Alex/Downloads'}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                          />
                      </div>

                      {/* API Config (Cloud Only) */}
                      {newAccountType !== 'Local' && (
                          <div className="border-t border-zinc-800 pt-4 mt-2">
                             <button 
                                onClick={() => setShowApiConfig(!showApiConfig)}
                                className="flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                             >
                                 <Settings className="w-3 h-3" />
                                 {showApiConfig ? "Hide API Configuration" : "Advanced: API Configuration (Optional)"}
                             </button>

                             {showApiConfig && (
                                 <div className="mt-3 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 space-y-3 animate-in slide-in-from-top-2">
                                     <div className="flex items-center gap-2 text-amber-500/80 text-xs mb-2">
                                         <Lock className="w-3 h-3" />
                                         <span>Credentials will be encrypted with your Vault Key.</span>
                                     </div>
                                     <div>
                                         <label className="block text-xs font-medium text-zinc-500 mb-1">Google Client ID</label>
                                         <input 
                                            type="text"
                                            value={clientId}
                                            onChange={(e) => setClientId(e.target.value)}
                                            placeholder="12345...apps.googleusercontent.com"
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                                         />
                                     </div>
                                     <div>
                                         <label className="block text-xs font-medium text-zinc-500 mb-1">API Key</label>
                                         <input 
                                            type="password"
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            placeholder="AIza..."
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                                         />
                                     </div>
                                 </div>
                             )}
                          </div>
                      )}

                      <div className="pt-2">
                          <button 
                            onClick={handleSaveNewAccount}
                            disabled={!newAccountName}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2"
                          >
                              <Check className="w-4 h-4" /> 
                              {(!clientId && !apiKey && newAccountType !== 'Local') ? "Add with Simulation Mode" : "Connect Integration"}
                          </button>
                          {(!clientId && !apiKey && newAccountType !== 'Local') && (
                              <p className="text-center text-[10px] text-zinc-600 mt-2">
                                  No API keys provided. Using synthetic data generation for demo.
                              </p>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
