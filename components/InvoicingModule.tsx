
import React, { useState, useEffect, useRef } from 'react';
import { Invoice, InvoiceLineItem, AppSettings, ViewState, InvoiceTemplate, InvoiceStructure, DynamicField } from '../types';
import { storageService } from '../services/storageService';
import { analyzeInvoiceTemplate } from '../services/geminiService';
import { Plus, Trash2, Save, Download, Printer, Copy, FileText, ChevronDown, ChevronUp, Image as ImageIcon, Upload, FileJson, AlertTriangle, ArrowLeft, RefreshCcw, LayoutTemplate, Loader2, Sparkles, Check, X, Edit, Layout, Building2, Grid, Lock, Wand2, Eye } from 'lucide-react';

interface InvoicingModuleProps {
    settings: AppSettings;
    onOpenCapture: () => void;
}

const DEFAULT_INVOICE: Partial<Invoice> = {
    status: 'Draft',
    items: [],
    vatRate: 25, // Swedish Default
    fitOnePage: false,
    headerText: 'FAKTURA',
    footerText: 'Godkänd för F-skatt',
};

// --- STANDARD SWEDISH TEMPLATE DEFINITION ---
const STANDARD_TEMPLATE_ID = 'std-se-consulting';

const SWEDISH_TEMPLATE: InvoiceTemplate = {
    id: STANDARD_TEMPLATE_ID,
    name: 'Svensk Standardfaktura (Clean)',
    createdAt: new Date().toISOString(),
    imageData: '', // Signals standard renderer
    structure: {
        header: [
            { id: 'inv_due', label: 'Förfallodatum', type: 'date', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'inv_ref', label: 'Er referens', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'delivery_date', label: 'Leveransdatum', type: 'date', defaultValue: '', geometry: { top: 0, left: 0 } }
        ],
        company: [
            { id: 'com_ref', label: 'Vår referens', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } }
        ],
        client: [
            { id: 'client_name', label: 'Kund (Företag/Namn)', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'client_co', label: 'C/O', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'client_address', label: 'Utdelningsadress', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'client_zip_city', label: 'Postnr & Ort', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'client_vat', label: 'Momsreg.nr (VAT)', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } }
        ],
        footer: [
            { id: 'bankgiro', label: 'Bankgiro', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'plusgiro', label: 'PlusGiro', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'swish', label: 'Swish', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'iban', label: 'IBAN', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'bic', label: 'BIC/SWIFT', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'org_nr', label: 'Org.nr', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'vat_nr', label: 'Momsreg.nr (SE)', type: 'text', defaultValue: '', geometry: { top: 0, left: 0 } },
            { id: 'terms', label: 'Betalningsvillkor', type: 'text', defaultValue: '30 dagar netto', geometry: { top: 0, left: 0 } }
        ],
        itemsColumns: {
            description: 'Beskrivning',
            quantity: 'Antal',
            price: 'Á-pris',
            total: 'Belopp'
        },
        columnLayout: { descriptionX: 0, quantityX: 0, priceX: 0, totalX: 0 },
        systemMapping: {
            invoiceNumberId: 'inv_no', // Virtual ID for standard
            dateId: 'inv_date', // Virtual ID for standard
            dueDateId: 'inv_due',
            clientNameId: 'client_name'
        }
    },
    defaults: {
        useGlobalBranding: true,
        contentTopOffset: 0,
        contentLeftOffset: 0
    }
};

export const InvoicingModule: React.FC<InvoicingModuleProps> = ({ settings, onOpenCapture }) => {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
    const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'edit' | 'template_select' | 'preview'>('list');
    
    // Template Manager State
    const [isManageTemplatesOpen, setIsManageTemplatesOpen] = useState(false);
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
    const [newTemplateData, setNewTemplateData] = useState<Partial<InvoiceTemplate> | null>(null);
    const [isAnalyzingTemplate, setIsAnalyzingTemplate] = useState(false);
    
    // File Inputs
    const templateUploadRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);

    // --- Load/Save ---
    useEffect(() => {
        const load = async () => {
            const [invData, tmplData] = await Promise.all([
                storageService.load<Invoice>('founder_os_invoices'),
                storageService.load<InvoiceTemplate>('founder_os_invoice_templates')
            ]);
            if (invData && invData.length > 0) setInvoices(invData);
            
            // Inject Standard Template if missing
            const loadedTemplates = tmplData || [];
            if (!loadedTemplates.find(t => t.id === STANDARD_TEMPLATE_ID)) {
                setTemplates([SWEDISH_TEMPLATE, ...loadedTemplates]);
            } else {
                setTemplates(loadedTemplates);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (invoices.length > 0) storageService.save('founder_os_invoices', invoices);
    }, [invoices]);

    useEffect(() => {
        if (templates.length > 0) storageService.save('founder_os_invoice_templates', templates);
    }, [templates]);

    const activeInvoice = invoices.find(i => i.id === activeInvoiceId) || null;
    const activeTemplateStructure = activeInvoice?.templateStructure || templates.find(t => t.id === activeInvoice?.templateId)?.structure;

    // --- Calculations ---
    const calculateTotals = (invoice: Invoice) => {
        const subtotal = invoice.items.reduce((sum, item) => sum + (item.total || 0), 0);
        const vat = subtotal * (invoice.vatRate / 100);
        const total = subtotal + vat;
        return { subtotal, vat, total };
    };

    const totals = activeInvoice ? calculateTotals(activeInvoice) : { subtotal: 0, vat: 0, total: 0 };

    // --- Actions ---

    const handleStartCreateInvoice = () => {
        setViewMode('template_select');
    };

    const handleCreateInvoiceFromTemplate = (templateId: string) => {
        const tmpl = templates.find(t => t.id === templateId);
        if (!tmpl) return;

        // Auto-Generate System Values from Defaults
        const systemDate = new Date().toISOString().split('T')[0];
        // Standard Swedish numbering often Year-Sequence (e.g., 2024001)
        const seq = (invoices.length + 1).toString().padStart(3, '0');
        const systemInvNum = `${new Date().getFullYear()}${seq}`;

        // Initialize Dynamic Values from Template Defaults
        const dynamicValues: Record<string, string> = {};
        
        // Helper to init fields
        const initFields = (fields: DynamicField[]) => {
            fields.forEach(f => {
                if (tmpl.structure.systemMapping.dateId === f.id) dynamicValues[f.id] = systemDate;
                else if (tmpl.structure.systemMapping.invoiceNumberId === f.id) dynamicValues[f.id] = systemInvNum;
                // Auto-fill Global Settings for known IDs if available
                else if (f.id === 'org_nr' && settings.orgNumber) dynamicValues[f.id] = settings.orgNumber;
                else if (f.id === 'vat_nr' && settings.vatNumber) dynamicValues[f.id] = settings.vatNumber;
                else if (f.id === 'bankgiro' && settings.bankgiro) dynamicValues[f.id] = settings.bankgiro;
                else if (f.id === 'plusgiro' && settings.plusgiro) dynamicValues[f.id] = settings.plusgiro;
                else if (f.id === 'swish' && settings.swish) dynamicValues[f.id] = settings.swish;
                else if (f.id === 'iban' && settings.iban) dynamicValues[f.id] = settings.iban;
                else if (f.id === 'bic' && settings.bic) dynamicValues[f.id] = settings.bic;
                else dynamicValues[f.id] = f.defaultValue || '';
            });
        };

        // Specific Logic for Standard Template Defaults
        if (templateId === STANDARD_TEMPLATE_ID) {
            // Set due date to 30 days
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30);
            dynamicValues['inv_due'] = dueDate.toISOString().split('T')[0];
            dynamicValues['delivery_date'] = systemDate;
        }

        initFields(tmpl.structure.header);
        initFields(tmpl.structure.company);
        initFields(tmpl.structure.client);
        initFields(tmpl.structure.footer);

        const newInvoice: Invoice = {
            id: crypto.randomUUID(),
            status: 'Draft',
            systemInvoiceNumber: systemInvNum,
            systemDate: systemDate,
            systemTotal: 0,
            systemClient: '',
            currency: 'SEK', 
            
            items: [{
                id: crypto.randomUUID(),
                itemNo: '1',
                description: 'Konsultarvode',
                unitPrice: 1000,
                units: 1,
                total: 1000
            }],
            vatRate: 25,
            
            templateId: tmpl.id,
            templateData: tmpl.imageData, // Empty string for standard template
            templateStructure: tmpl.structure, // FREEZE SCHEMA
            dynamicValues: dynamicValues,
            
            contentTopOffset: tmpl.defaults.contentTopOffset,
            contentLeftOffset: tmpl.defaults.contentLeftOffset,
            ...DEFAULT_INVOICE
        } as Invoice;

        setInvoices(prev => [newInvoice, ...prev]);
        setActiveInvoiceId(newInvoice.id);
        setViewMode('edit');
        storageService.logActivity(ViewState.INVOICES, 'CREATE', `Created Invoice from template ${tmpl.name}`);
    };

    const handleUpdateInvoice = (field: keyof Invoice, value: any) => {
        if (!activeInvoiceId) return;
        setInvoices(prev => prev.map(inv => inv.id === activeInvoiceId ? { ...inv, [field]: value } : inv));
    };

    const handleUpdateDynamicValue = (fieldId: string, value: string) => {
        if (!activeInvoice || !activeTemplateStructure) return;
        
        const mapping = activeTemplateStructure.systemMapping;
        let updates: Partial<Invoice> = {};

        if (fieldId === mapping.invoiceNumberId) updates.systemInvoiceNumber = value;
        if (fieldId === mapping.dateId) updates.systemDate = value;
        if (fieldId === mapping.clientNameId) updates.systemClient = value;

        setInvoices(prev => prev.map(inv => {
            if (inv.id === activeInvoiceId) {
                return {
                    ...inv,
                    ...updates,
                    dynamicValues: { ...inv.dynamicValues, [fieldId]: value }
                };
            }
            return inv;
        }));
    };

    const handleUpdateItem = (itemId: string, field: keyof InvoiceLineItem, value: any) => {
        if (!activeInvoice) return;
        const newItems = activeInvoice.items.map(item => {
            if (item.id === itemId) {
                const updated = { ...item, [field]: value };
                if (field === 'unitPrice' || field === 'units') {
                    updated.total = Number(updated.unitPrice) * Number(updated.units);
                }
                return updated;
            }
            return item;
        });
        handleUpdateInvoice('items', newItems);
    };

    const handleAddItem = () => {
        if (!activeInvoice) return;
        const newItem: InvoiceLineItem = {
            id: crypto.randomUUID(),
            itemNo: (activeInvoice.items.length + 1).toString(),
            description: '',
            unitPrice: 0,
            units: 1,
            total: 0
        };
        handleUpdateInvoice('items', [...activeInvoice.items, newItem]);
    };

    const handleDeleteItem = (itemId: string) => {
        if (!activeInvoice) return;
        handleUpdateInvoice('items', activeInvoice.items.filter(i => i.id !== itemId));
    };

    const handleDeleteInvoice = (e: React.MouseEvent, inv: Invoice) => {
        e.stopPropagation();
        if (inv.status !== 'Draft') {
            alert("Only Draft invoices can be deleted.");
            return;
        }
        if (confirm("Delete this draft invoice?")) {
            setInvoices(prev => prev.filter(i => i.id !== inv.id));
            if (activeInvoiceId === inv.id) {
                setActiveInvoiceId(null);
                setViewMode('list');
            }
            storageService.logActivity(ViewState.INVOICES, 'DELETE', 'Deleted invoice');
        }
    };

    const handleDeleteTemplate = (id: string) => {
        if (id === STANDARD_TEMPLATE_ID) {
            alert("Cannot delete the standard system template.");
            return;
        }
        if(confirm("Delete this template?")) {
            setTemplates(prev => prev.filter(t => t.id !== id));
            storageService.logActivity(ViewState.INVOICES, 'DELETE', 'Deleted template');
        }
    };

    const handleDuplicate = (e: React.MouseEvent, invoice: Invoice) => {
        e.stopPropagation();
        const copy: Invoice = {
            ...invoice,
            id: crypto.randomUUID(),
            systemInvoiceNumber: `${invoice.systemInvoiceNumber}-KOPIA`,
            status: 'Draft',
            systemDate: new Date().toISOString().split('T')[0]
        };
        setInvoices(prev => [copy, ...prev]);
        storageService.logActivity(ViewState.INVOICES, 'CREATE', `Duplicated ${invoice.systemInvoiceNumber}`);
    };

    const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const importedInvoice = JSON.parse(text);
            if (importedInvoice.id && importedInvoice.items) {
                 const newInvoice = {
                     ...importedInvoice,
                     id: crypto.randomUUID(),
                     systemInvoiceNumber: `${importedInvoice.systemInvoiceNumber}-IMP`,
                     status: 'Draft'
                 };
                 setInvoices(prev => [newInvoice, ...prev]);
                 alert("Invoice imported successfully.");
            } else {
                alert("Invalid invoice JSON.");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to import JSON.");
        } finally {
            if (importInputRef.current) importInputRef.current.value = '';
        }
    };

    // --- Template Management ---

    const triggerTemplateUpload = () => {
        if (templateUploadRef.current) {
            templateUploadRef.current.value = '';
            templateUploadRef.current.click();
        }
    };

    const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            const file = e.target.files?.[0];
            if (!file) return;

            setIsManageTemplatesOpen(true);
            setIsCreatingTemplate(true);
            setIsAnalyzingTemplate(true);
            setNewTemplateData(null);
            
            const processFile = async () => {
                if (file.type === 'application/pdf') {
                    const pdfjsLib = (window as any).pdfjsLib;
                    if (!pdfjsLib) throw new Error("PDF.js not loaded");
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
                    const page = await pdf.getPage(1);
                    const viewport = page.getViewport({ scale: 1.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await page.render({ canvasContext: context!, viewport }).promise;
                    return canvas.toDataURL('image/jpeg', 0.8);
                } else {
                    return new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });
                }
            };

            const dataUrl = await processFile();
            const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
            if (!matches || matches.length !== 3) throw new Error("Invalid file format.");
            
            const analysis = await analyzeInvoiceTemplate(matches[2], matches[1]);
            
            // Heuristic Auto-Map
            const structure = analysis.structure!;
            const findFieldId = (s: InvoiceStructure, k: string[]) => 
                [...s.header, ...s.company, ...s.client, ...s.footer].find(f => k.some(w => f.label.toLowerCase().includes(w)))?.id;

            structure.systemMapping = {
                invoiceNumberId: findFieldId(structure, ['invoice', 'inv', 'number', 'no', 'faktura', 'nr']),
                dateId: findFieldId(structure, ['date', 'dated', 'issue', 'datum']),
                clientNameId: findFieldId(structure, ['bill', 'to', 'client', 'kund', 'mottagare']),
            };

            setNewTemplateData({
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                name: analysis.name || file.name.split('.')[0],
                imageData: dataUrl,
                structure: structure,
                defaults: analysis.defaults
            });

        } catch (e: any) {
            console.error("Template Creation Error:", e);
            alert(`Error: ${e.message}`);
            setIsCreatingTemplate(false);
        } finally {
            setIsAnalyzingTemplate(false);
            if (templateUploadRef.current) templateUploadRef.current.value = '';
        }
    };

    const handleSaveTemplate = () => {
        if (!newTemplateData || !newTemplateData.name) return;
        setTemplates(prev => [...prev, newTemplateData as InvoiceTemplate]);
        setIsCreatingTemplate(false);
        setNewTemplateData(null);
    };

    const handleExportJSON = () => {
        if (!activeInvoice) return;
        const blob = new Blob([JSON.stringify(activeInvoice, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeInvoice.systemInvoiceNumber}.json`;
        a.click();
    };

    const handlePrint = () => {
        window.print();
    };

    // --- Render Helpers ---

    const renderDynamicFieldsInput = (fields: DynamicField[]) => {
        if (!activeInvoice) return null;
        return (
            <div className="space-y-3">
                {fields.map(field => (
                    <div key={field.id}>
                        <label className="text-[10px] text-zinc-500 block mb-1">{field.label}</label>
                        {field.type === 'textarea' ? (
                            <textarea 
                                value={activeInvoice.dynamicValues[field.id] || ''}
                                onChange={(e) => handleUpdateDynamicValue(field.id, e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm min-h-[60px]"
                            />
                        ) : (
                            <input 
                                type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                                value={activeInvoice.dynamicValues[field.id] || ''}
                                onChange={(e) => handleUpdateDynamicValue(field.id, e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm"
                            />
                        )}
                    </div>
                ))}
            </div>
        );
    };

    const renderAbsoluteField = (field: DynamicField) => {
        if (!activeInvoice || !field.geometry) return null;
        const value = activeInvoice.dynamicValues[field.id];
        if (value === undefined || value === null || value === '') return null;

        return (
            <div 
                key={field.id}
                style={{
                    position: 'absolute',
                    top: `${field.geometry.top}%`,
                    left: `${field.geometry.left}%`,
                    width: field.geometry.width ? `${field.geometry.width}%` : 'auto',
                    minWidth: '50px', 
                    backgroundColor: 'white', 
                    zIndex: 10,
                    padding: '2px 4px', 
                    margin: '-1px -2px',
                    boxSizing: 'border-box',
                    lineHeight: '1.2'
                }}
                className="pointer-events-none"
            >
                <div className="text-sm font-medium whitespace-pre-wrap leading-tight text-black">{value}</div>
            </div>
        );
    };

    const renderDynamicFieldsPreview = (fields: DynamicField[]) => {
        if (!activeInvoice) return null;
        return <>{fields.filter(f => f.geometry).map(renderAbsoluteField)}</>;
    };
    
    // --- SPECIAL RENDERER FOR STANDARD SWEDISH INVOICE ---
    const StandardSwedishInvoice = () => {
        if (!activeInvoice) return null;
        
        const val = (id: string) => activeInvoice.dynamicValues[id] || '';
        const { subtotal, vat, total } = calculateTotals(activeInvoice);

        return (
            <div id="invoice-preview" className="w-[794px] min-h-[1123px] bg-white text-black p-16 relative shadow-2xl mx-auto flex flex-col box-border font-sans">
                {/* Header */}
                <div className="flex justify-between items-start mb-12">
                    <div className="w-1/2">
                        {settings.logoUrl ? (
                            <img src={settings.logoUrl} alt="Logo" className="h-16 object-contain mb-6" />
                        ) : (
                            <h1 className="text-3xl font-bold uppercase tracking-wider mb-2 text-gray-800">{settings.companyName || 'Ditt Företag'}</h1>
                        )}
                        {/* Company address removed from top-left to avoid clutter, kept in footer/seller box if needed */}
                    </div>
                    <div className="w-1/2 text-right">
                        <h2 className="text-5xl font-bold text-gray-900 mb-8 tracking-tight">FAKTURA</h2>
                        <div className="inline-block text-left bg-gray-50 p-4 rounded-lg border border-gray-100 min-w-[240px]">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <span className="text-gray-500 font-medium">Fakturanr:</span>
                                <span className="font-bold text-gray-900 text-right">{activeInvoice.systemInvoiceNumber}</span>
                                
                                <span className="text-gray-500 font-medium">Datum:</span>
                                <span className="text-right text-gray-900">{activeInvoice.systemDate}</span>
                                
                                <span className="text-gray-500 font-medium">Förfallodatum:</span>
                                <span className="text-right text-gray-900">{val('inv_due')}</span>
                                
                                <span className="text-gray-500 font-medium">Er referens:</span>
                                <span className="text-right text-gray-900 truncate max-w-[120px]">{val('inv_ref')}</span>
                                
                                <span className="text-gray-500 font-medium">Vår referens:</span>
                                <span className="text-right text-gray-900 truncate max-w-[120px]">{val('com_ref')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Seller & Buyer Blocks */}
                <div className="flex mb-12 gap-12">
                    {/* Seller Info (Optional prominent placement or rely on footer/logo) - Here we emphasize standard layout */}
                    <div className="w-1/2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 border-b pb-1">Avsändare</h3>
                        <div className="text-sm text-gray-800 leading-relaxed">
                            <div className="font-bold">{settings.companyName}</div>
                            <div className="whitespace-pre-wrap text-gray-600">{settings.companyAddress}</div>
                        </div>
                    </div>

                    <div className="w-1/2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 border-b pb-1">Fakturaadress (Mottagare)</h3>
                        <div className="text-sm text-gray-800 leading-relaxed">
                            <div className="font-bold text-lg">{val('client_name')}</div>
                            {val('client_co') && <div>c/o {val('client_co')}</div>}
                            {val('client_address') && <div>{val('client_address')}</div>}
                            <div>{val('client_zip_city')}</div>
                            {val('client_vat') && <div className="text-gray-500 text-xs mt-2 font-mono">VAT: {val('client_vat')}</div>}
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 mb-8">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b-2 border-gray-800 text-gray-600 uppercase text-xs tracking-wider">
                                <th className="pb-3 w-1/2 font-bold">Beskrivning</th>
                                <th className="pb-3 text-right font-bold">Antal</th>
                                <th className="pb-3 text-right font-bold">Á-pris</th>
                                <th className="pb-3 text-right font-bold">Belopp</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {activeInvoice.items.map((item) => (
                                <tr key={item.id}>
                                    <td className="py-4 pr-4 align-top">
                                        <div className="font-medium text-gray-900 text-base">{item.description}</div>
                                    </td>
                                    <td className="py-4 text-right align-top text-gray-600">{item.units}</td>
                                    <td className="py-4 text-right align-top text-gray-600">{item.unitPrice.toFixed(2)}</td>
                                    <td className="py-4 text-right align-top font-bold text-gray-900">{item.total.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Totals & Signature */}
                <div className="flex justify-between items-end mb-16 border-t-2 border-gray-100 pt-6">
                    <div className="w-1/2">
                        {settings.signatureUrl && (
                            <div className="mb-2">
                                <img src={settings.signatureUrl} alt="Signature" className="h-16 object-contain" />
                                <div className="border-t border-gray-300 w-48 mt-1"></div>
                                <p className="text-xs text-gray-400 mt-1">Signatur</p>
                            </div>
                        )}
                        {val('note') && (
                            <div className="mt-4 text-sm text-gray-600 bg-yellow-50 p-3 rounded border border-yellow-100 max-w-xs">
                                <span className="font-bold text-gray-800 block mb-1">Notering:</span> 
                                {val('note')}
                            </div>
                        )}
                    </div>

                    <div className="w-64 space-y-2">
                        <div className="flex justify-between text-sm text-gray-600">
                            <span>Netto:</span>
                            <span>{subtotal.toFixed(2)} {activeInvoice.currency}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-600">
                            <span>Moms ({activeInvoice.vatRate}%):</span>
                            <span>{vat.toFixed(2)} {activeInvoice.currency}</span>
                        </div>
                        <div className="h-px bg-gray-300 my-3"></div>
                        <div className="flex justify-between text-xl font-bold text-gray-900">
                            <span>Att betala:</span>
                            <span>{total.toFixed(2)} {activeInvoice.currency}</span>
                        </div>
                    </div>
                </div>

                {/* Footer (Fixed at bottom via margin-top: auto in flex parent) */}
                <div className="mt-auto border-t-2 border-gray-800 pt-6 text-[10px] text-gray-500 leading-snug">
                    <div className="grid grid-cols-3 gap-8">
                        <div>
                            <h4 className="font-bold text-gray-900 uppercase mb-2">Adress & Kontakt</h4>
                            <div className="font-semibold text-gray-700">{settings.companyName}</div>
                            <div className="whitespace-pre-wrap mb-1">{settings.companyAddress}</div>
                            <div className="mt-2 font-medium">{settings.fSkattStatus || 'Godkänd för F-skatt'}</div>
                        </div>
                        
                        <div>
                            <h4 className="font-bold text-gray-900 uppercase mb-2">Betalningsuppgifter</h4>
                            <div className="grid grid-cols-[60px_1fr] gap-y-1">
                                {val('bankgiro') && <><span className="text-gray-400">Bankgiro:</span> <span className="font-mono text-gray-700">{val('bankgiro')}</span></>}
                                {val('plusgiro') && <><span className="text-gray-400">PlusGiro:</span> <span className="font-mono text-gray-700">{val('plusgiro')}</span></>}
                                {val('swish') && <><span className="text-gray-400">Swish:</span> <span className="font-mono text-gray-700">{val('swish')}</span></>}
                                {val('iban') && <><span className="text-gray-400">IBAN:</span> <span className="font-mono text-gray-700">{val('iban')}</span></>}
                                {val('bic') && <><span className="text-gray-400">BIC:</span> <span className="font-mono text-gray-700">{val('bic')}</span></>}
                            </div>
                            <div className="mt-3 font-medium text-gray-900">Villkor: {val('terms')}</div>
                        </div>

                        <div>
                            <h4 className="font-bold text-gray-900 uppercase mb-2">Bolagsuppgifter</h4>
                            <div className="grid grid-cols-[60px_1fr] gap-y-1">
                                {val('org_nr') && <><span className="text-gray-400">Org.nr:</span> <span className="font-mono text-gray-700">{val('org_nr')}</span></>}
                                {val('vat_nr') && <><span className="text-gray-400">VAT/Moms:</span> <span className="font-mono text-gray-700">{val('vat_nr')}</span></>}
                                <span className="text-gray-400">Säte:</span> <span className="text-gray-700">{settings.country}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // --- MAIN RENDER ---
    return (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-right-4 relative">
            
            {/* Global Hidden Inputs */}
            <input type="file" ref={templateUploadRef} className="hidden" accept=".pdf,.jpg,.png,.jpeg" onChange={handleTemplateUpload} />
            <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={handleImportJSON} />

            {/* Template Manager Modal (Code hidden for brevity, kept same logic) */}
            {isManageTemplatesOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-zinc-950 border border-zinc-800 w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                        {/* ... Template Manager UI (Reuse existing code) ... */}
                        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><LayoutTemplate className="w-6 h-6 text-indigo-400" /> Template Library</h3>
                            <button onClick={() => { setIsManageTemplatesOpen(false); setIsCreatingTemplate(false); setNewTemplateData(null); }}><X className="w-6 h-6 text-zinc-400"/></button>
                        </div>
                        {/* ... Rest of Template Manager ... */}
                    </div>
                </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
                <div className="flex flex-col h-full gap-6">
                    <header className="flex justify-between items-end border-b border-white/5 pb-6">
                        <div>
                            <h2 className="text-3xl font-bold text-white tracking-tight">Invoicing</h2>
                            <p className="text-zinc-400 mt-2 font-light">Manage consulting invoices and templates.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => importInputRef.current?.click()} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white transition-colors" title="Import JSON"><Upload className="w-5 h-5" /></button>
                            <button onClick={handleStartCreateInvoice} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium flex items-center gap-2 shadow-lg transition-all">
                                <Plus className="w-4 h-4" /> New Invoice
                            </button>
                        </div>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar pb-10">
                        {invoices.map(inv => (
                            <div 
                                key={inv.id} 
                                onClick={() => { setActiveInvoiceId(inv.id); setViewMode('edit'); }}
                                className="group bg-zinc-900/40 border border-white/5 hover:border-indigo-500/50 p-5 rounded-2xl cursor-pointer transition-all hover:bg-zinc-900/60 relative"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-white font-bold text-lg">{inv.systemInvoiceNumber}</h3>
                                        <p className="text-zinc-500 text-xs">{inv.systemClient || 'No Client'}</p>
                                    </div>
                                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${inv.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-700/50 text-zinc-400'}`}>
                                        {inv.status}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs pt-2 border-t border-white/5">
                                    <span className="text-zinc-500">Total</span>
                                    <span className="text-white font-mono font-bold">{calculateTotals(inv).total.toFixed(2)} {inv.currency}</span>
                                </div>
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => handleDuplicate(e, inv)} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300"><Copy className="w-3.5 h-3.5" /></button>
                                    <button onClick={(e) => handleDeleteInvoice(e, inv)} className="p-1.5 bg-rose-900/30 hover:bg-rose-900/50 rounded-lg text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                        ))}
                        {invoices.length === 0 && (
                            <div className="col-span-full flex flex-col items-center justify-center py-20 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-3xl">
                                <FileText className="w-12 h-12 opacity-20 mb-4" />
                                <p>No invoices yet. Create one to get started.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Template Select View */}
            {viewMode === 'template_select' && (
                <div className="flex flex-col h-full gap-6">
                    <header className="flex items-center gap-4 border-b border-white/5 pb-6">
                        <button onClick={() => setViewMode('list')} className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <h2 className="text-2xl font-bold text-white">Select Template</h2>
                    </header>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 overflow-y-auto custom-scrollbar">
                        {/* Always show Standard Template First */}
                        {templates.map(tmpl => (
                            <div 
                                key={tmpl.id} 
                                onClick={() => handleCreateInvoiceFromTemplate(tmpl.id)}
                                className={`group relative aspect-[3/4] bg-zinc-900 border rounded-2xl overflow-hidden hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer shadow-lg ${tmpl.id === STANDARD_TEMPLATE_ID ? 'border-indigo-500/30 bg-indigo-900/5' : 'border-zinc-800'}`}
                            >
                                <div className="p-6 h-full flex flex-col">
                                    <div className="flex-1 bg-white/5 rounded-xl mb-4 border border-white/5 p-4 flex flex-col items-center justify-center text-zinc-600">
                                        {tmpl.id === STANDARD_TEMPLATE_ID ? <FileText className="w-12 h-12 text-indigo-400 mb-2"/> : <LayoutTemplate className="w-12 h-12 mb-2"/>}
                                        {tmpl.id === STANDARD_TEMPLATE_ID && <span className="text-xs text-indigo-300 font-medium bg-indigo-500/10 px-2 py-1 rounded">Recommended</span>}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-lg leading-tight">{tmpl.name}</h4>
                                        <p className="text-xs text-zinc-400 mt-1">{tmpl.id === STANDARD_TEMPLATE_ID ? 'Standard Clean Layout' : 'Uploaded Custom Layout'}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div 
                            onClick={triggerTemplateUpload}
                            className="aspect-[3/4] border-2 border-dashed border-zinc-800 hover:border-indigo-500 rounded-2xl flex flex-col items-center justify-center cursor-pointer bg-zinc-900/30 hover:bg-zinc-900 transition-all group"
                        >
                            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                                <Plus className="w-8 h-8 text-zinc-500 group-hover:text-white" />
                            </div>
                            <span className="mt-4 font-bold text-zinc-400 group-hover:text-white">Upload New</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Editor & Preview View */}
            {(viewMode === 'edit' || viewMode === 'preview') && activeInvoice && (
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex justify-between items-center bg-zinc-900 border-b border-white/5 p-4 shrink-0">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setViewMode('list')} className="text-zinc-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors">
                                <ArrowLeft className="w-4 h-4" /> Back
                            </button>
                            <div className="h-6 w-px bg-white/10"></div>
                            <input 
                                value={activeInvoice.systemInvoiceNumber}
                                onChange={(e) => handleUpdateInvoice('systemInvoiceNumber', e.target.value)}
                                className="bg-transparent text-white font-bold focus:outline-none w-32 border-b border-transparent focus:border-zinc-700 transition-colors"
                            />
                            <select 
                                value={activeInvoice.status}
                                onChange={(e) => handleUpdateInvoice('status', e.target.value)}
                                className={`text-xs font-bold px-2 py-1 rounded bg-zinc-800 border-none outline-none ${activeInvoice.status === 'Paid' ? 'text-emerald-400' : 'text-zinc-300'}`}
                            >
                                <option value="Draft">Draft</option>
                                <option value="Sent">Sent</option>
                                <option value="Paid">Paid</option>
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setViewMode(viewMode === 'preview' ? 'edit' : 'preview')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'preview' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                                {viewMode === 'preview' ? <><Edit className="w-4 h-4"/> Edit Mode</> : <><Eye className="w-4 h-4"/> Preview</>}
                            </button>
                            <button onClick={handleExportJSON} className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg" title="Export JSON"><FileJson className="w-5 h-5"/></button>
                            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-indigo-500/20">
                                <Printer className="w-4 h-4" /> Print / PDF
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        {/* Editor Sidebar - Hidden in Preview Mode */}
                        {viewMode === 'edit' && (
                            <div className="w-full md:w-[450px] lg:w-[500px] border-r border-white/5 overflow-y-auto custom-scrollbar bg-zinc-900/30 p-6 space-y-8 animate-in slide-in-from-left-4">
                                <div>
                                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">Invoice Details</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[10px] text-zinc-500 block mb-1">Invoice Date</label>
                                            <input type="date" value={activeInvoice.systemDate} onChange={(e) => handleUpdateInvoice('systemDate', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm"/>
                                        </div>
                                        {renderDynamicFieldsInput(activeTemplateStructure?.header || [])}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">Company & Client</h3>
                                    {renderDynamicFieldsInput(activeTemplateStructure?.company || [])}
                                    {renderDynamicFieldsInput(activeTemplateStructure?.client || [])}
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Line Items</h3>
                                        <button onClick={handleAddItem} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus className="w-3 h-3"/> Add</button>
                                    </div>
                                    <div className="space-y-3">
                                        {activeInvoice.items.map((item) => (
                                            <div key={item.id} className="bg-black/20 border border-white/5 p-3 rounded-xl relative group">
                                                <button onClick={() => handleDeleteItem(item.id)} className="absolute top-2 right-2 text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5"/></button>
                                                <div className="mb-2">
                                                    <label className="text-[10px] text-zinc-500 block">Description</label>
                                                    <input value={item.description} onChange={e => handleUpdateItem(item.id, 'description', e.target.value)} className="w-full bg-transparent border-b border-zinc-800 text-white text-xs py-1 font-medium" />
                                                </div>
                                                <div className="grid grid-cols-3 gap-4">
                                                    <div>
                                                        <label className="text-[10px] text-zinc-500 block">Price</label>
                                                        <input type="number" value={item.unitPrice} onChange={e => handleUpdateItem(item.id, 'unitPrice', e.target.value)} className="w-full bg-transparent border-b border-zinc-800 text-white text-xs py-1" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-zinc-500 block">Qty</label>
                                                        <input type="number" value={item.units} onChange={e => handleUpdateItem(item.id, 'units', e.target.value)} className="w-full bg-transparent border-b border-zinc-800 text-white text-xs py-1" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-zinc-500 block">Total</label>
                                                        <div className="text-white text-xs py-1 font-mono">{item.total.toFixed(2)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Payment & Footer</h3>
                                    {renderDynamicFieldsInput(activeTemplateStructure?.footer || [])}
                                </div>
                                
                                <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] text-zinc-500 block mb-1">Currency</label>
                                        <input value={activeInvoice.currency} onChange={(e) => handleUpdateInvoice('currency', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-500 block mb-1">VAT Rate %</label>
                                        <input type="number" value={activeInvoice.vatRate} onChange={(e) => handleUpdateInvoice('vatRate', Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Live Preview Area */}
                        <div className={`flex-1 bg-zinc-950 flex justify-center overflow-y-auto p-8 ${viewMode === 'preview' ? 'items-center bg-zinc-900' : ''}`}>
                            {/* DUAL RENDERER: Standard vs Legacy */}
                            {activeInvoice.templateId === STANDARD_TEMPLATE_ID ? (
                                <StandardSwedishInvoice />
                            ) : (
                                <div 
                                    id="invoice-preview"
                                    className={`bg-white text-black shadow-2xl relative transition-all origin-top ${activeInvoice.fitOnePage ? 'h-[1123px] overflow-hidden' : 'min-h-[1123px]'}`}
                                    style={{ 
                                        width: '794px', 
                                        padding: '0', 
                                        boxSizing: 'border-box',
                                        fontSize: activeInvoice.fontSize === 'small' ? '12px' : activeInvoice.fontSize === 'large' ? '16px' : '14px',
                                        position: 'relative', 
                                        backgroundImage: activeInvoice.templateData ? `url(${activeInvoice.templateData})` : 'none',
                                        backgroundSize: 'contain',
                                        backgroundRepeat: 'no-repeat',
                                        transform: viewMode === 'preview' ? 'scale(0.9)' : 'scale(1)',
                                    }}
                                >
                                    {/* Legacy Overlay Renderer */}
                                    <div className="absolute inset-0 z-10 pointer-events-none">
                                        {renderDynamicFieldsPreview(activeTemplateStructure?.company || [])}
                                        {renderDynamicFieldsPreview(activeTemplateStructure?.header || [])}
                                        {renderDynamicFieldsPreview(activeTemplateStructure?.client || [])}
                                    </div>
                                    <div className="absolute z-20" style={{ 
                                        top: activeTemplateStructure?.itemsTableGeometry?.top ? `${activeTemplateStructure.itemsTableGeometry.top}%` : '40%',
                                        left: activeTemplateStructure?.itemsTableGeometry?.left ? `${activeTemplateStructure.itemsTableGeometry.left}%` : '5%',
                                        width: activeTemplateStructure?.itemsTableGeometry?.width ? `${activeTemplateStructure.itemsTableGeometry.width}%` : '90%',
                                        paddingTop: '10px'
                                    }}>
                                        {activeInvoice.items.map((item) => {
                                            const layout = activeTemplateStructure?.columnLayout || { descriptionX: 5, quantityX: 50, priceX: 65, totalX: 80 };
                                            return (
                                            <div key={item.id} className="relative flex items-center w-full bg-white mb-1" style={{ height: activeTemplateStructure?.itemsTableGeometry?.rowHeight ? `${activeTemplateStructure.itemsTableGeometry.rowHeight}%` : '30px' }}>
                                                <div className="absolute top-0 text-left font-medium text-sm whitespace-pre-wrap leading-tight pl-2" style={{ left: `${layout.descriptionX}%`, width: '35%' }}>{item.description}</div>
                                                <div className="absolute top-0 text-left text-sm pl-2" style={{ left: `${layout.quantityX}%`, width: '10%' }}>{item.units}</div>
                                                <div className="absolute top-0 text-left text-sm pl-2" style={{ left: `${layout.priceX}%`, width: '15%' }}>{item.unitPrice.toFixed(2)}</div>
                                                <div className="absolute top-0 text-left font-bold text-sm pl-2" style={{ left: `${layout.totalX}%`, width: '15%' }}>{item.total.toFixed(2)}</div>
                                            </div>
                                        );
                                        })}
                                    </div>
                                    <div className="absolute inset-0 z-30 pointer-events-none">
                                        {renderDynamicFieldsPreview(activeTemplateStructure?.footer || [])}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Print Styles Injection */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #invoice-preview, #invoice-preview * { visibility: visible; }
                    #invoice-preview {
                        position: fixed;
                        left: 0; top: 0;
                        width: 100%; height: 100%;
                        margin: 0; padding: 0;
                        box-shadow: none;
                        background-color: white !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        transform: none !important;
                    }
                    @page { size: A4; margin: 0; }
                }
            `}</style>
        </div>
    );
};
