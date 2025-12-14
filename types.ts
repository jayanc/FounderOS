
export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  FINANCE = 'FINANCE',
  OPS = 'OPS',
  TIMESHEETS = 'TIMESHEETS',
  CONTRACTS = 'CONTRACTS',
  PLANNING = 'PLANNING',
  INVOICES = 'INVOICES',
  SETTINGS = 'SETTINGS',
  ADMIN = 'ADMIN'
}

export type IntegrationType = 'Gmail' | 'Outlook' | 'GDrive' | 'Local';

export type StorageProviderType = 'LOCAL' | 'GCS' | 'FIREBASE';

export type DeviceTier = 'High-End' | 'Mid-Range' | 'Low-End';

export type UserRole = 'Admin' | 'User' | 'Viewer';

export interface StorageStats {
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  tier: DeviceTier;
  recommendedLimitBytes: number;
}

export interface ApiConfig {
  clientId?: string;
  apiKey?: string;
  scope?: string;
}

export interface User {
  id?: string; // UUID
  email: string;
  name: string;
  password?: string; // Only used in the Admin Directory for simulation
  mfaVerified: boolean;
  storageProvider?: StorageProviderType;
  role?: UserRole;
  allowedModules?: ViewState[]; // Access Control List
  department?: string;
  lastActive?: string;
}

export interface AppSettings {
  country: string;
  language: string;
  currency: string;
  exchangeRates: Record<string, number>;
  // Global Branding
  companyName?: string;
  companyAddress?: string;
  logoUrl?: string; // Base64
  signatureUrl?: string; // Base64
  defaultInvoiceCountry?: string;
  defaultInvoiceLanguage?: string;
  
  // Business Details (SE)
  orgNumber?: string;
  vatNumber?: string;
  fSkattStatus?: string;
  
  // Payment Details
  bankgiro?: string;
  plusgiro?: string;
  swish?: string;
  iban?: string;
  bic?: string;

  // Cloud Storage Config
  gcpConfig?: {
      bucketName: string;
      projectId: string;
      folderPath?: string;
      autoSync: boolean;
  };
}

// --- DYNAMIC INVOICE SCHEMA ---

export type FieldType = 'text' | 'date' | 'number' | 'textarea' | 'currency';

export interface DynamicField {
    id: string;
    label: string; // The extracted caption (e.g. "Invoice No")
    defaultValue: string; // Extracted value from sample
    type: FieldType;
    placeholder?: string;
    // Spatial Data for Exact Reconstruction
    geometry?: {
        top: number; // Percentage (0-100)
        left: number; // Percentage (0-100)
        width?: number; // Percentage (0-100)
    };
}

export interface InvoiceStructure {
    header: DynamicField[]; // Top Right usually (Inv #, Date)
    company: DynamicField[]; // Top Left (Sender info)
    client: DynamicField[]; // Middle Left (Bill To)
    footer: DynamicField[]; // Bottom (Payment terms, notes)
    itemsColumns: {
        description: string;
        quantity: string;
        price: string;
        total: string;
    }; 
    
    // Position of the table start
    itemsTableGeometry?: {
        top: number; // Y position where ROWS begin (below header)
        left?: number; // X position of table start
        width?: number; // Width of table
        rowHeight?: number; // Approximate height of a row in %
    };

    // Precise Column X Positions (Percentage 0-100)
    columnLayout: {
        descriptionX: number;
        quantityX: number;
        priceX: number;
        totalX: number;
    };
    
    // System Mapping: Which dynamic ID maps to core system logic?
    systemMapping: {
        invoiceNumberId?: string;
        dateId?: string;
        dueDateId?: string;
        totalAmountId?: string;
        currencyId?: string;
        clientNameId?: string;
    };
}

export interface InvoiceTemplate {
    id: string;
    name: string;
    imageData: string; // Base64 Background (Optional use)
    createdAt: string;
    
    // The "Frozen" Schema
    structure: InvoiceStructure;
    
    // Layout Defaults
    defaults: {
        useGlobalBranding: boolean;
        contentTopOffset: number;
        contentLeftOffset: number;
        accentColor?: string;
    };
}

// ------------------------------

export interface IntegrationAccount {
  id: string;
  name: string;
  provider: IntegrationType;
  isConnected: boolean;
  type: 'Personal' | 'Work';
  lastSynced?: string;
  apiConfig?: ApiConfig;
}

export interface ReceiptData {
  id: string;
  vendor: string;
  amount: number;
  currency: string;
  vatAmount?: number;
  date: string;
  category: string;
  description: string;
  taxDeductible: boolean;
  notes: string;
  imageUrl?: string;
  sourceUrl?: string;
  matchConfidence: number;
  source?: string;
  tags?: string[];
}

export interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  matchedReceiptId?: string;
  status: 'Reconciled' | 'Unreconciled' | 'Ignored' | 'Pending';
  matchType?: 'Exact' | 'AI' | 'Manual';
  comments?: string;
  aiSuggestion?: string;
  sourceFile?: string;
}

export interface ActionItem {
  id: string;
  task: string;
  assignee: string;
  deadline: string;
  priority: 'High' | 'Medium' | 'Low';
  source: 'Slack' | 'Email' | 'Meeting' | 'File';
  status: 'Pending' | 'Done';
  originEmail?: string;
  tags?: string[];
  attachments?: { name: string, path: string }[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  type: 'Meeting' | 'Flight' | 'Hotel' | 'Reminder';
  attendees?: string[];
  description: string;
}

export interface TimesheetEntry {
  id: string;
  date: string;
  employee: string;
  project: string;
  task: string;
  hours: number;
  notes?: string;
  sourceFile?: string;
  status?: 'Draft' | 'Validated';
}

export type ContractCategory = 'Employee' | 'Customer' | 'Consultant' | 'Partner';

export interface ContractData {
  id: string;
  name: string;
  category: ContractCategory;
  summary: string;
  keyConstraints: string[];
  expirationDate?: string;
  parties: string[];
  sourceUrl?: string;
  imageUrl?: string;
  uploadDate: string;
  status?: 'Review' | 'Validated';
}

export interface GrowthPlan {
    id: string;
    name: string;
    currency: string;
    startingCash: number;
    createdAt: string;

    // Consulting Stream
    consultingRevenue: number; // Monthly Base
    consultingGrowth: number; // MoM %
    billableHeadcount: number;
    avgHourlyRate: number;
    utilization: number; // %

    // Product/Marketplace Stream
    productRevenue: number; // MRR
    productGrowth: number; // MoM %
    cloudCostPercent: number; // % of Rev (Inference/Compute)

    // OpEx
    fixedOpEx: number; // Office, Legal, Tools
    marketingBudget: number;
    salaryPerHead: number; // Avg cost per employee
}

export interface InvoiceLineItem {
    id: string;
    itemNo: string;
    description: string;
    unitPrice: number;
    units: number;
    total: number;
}

export interface Invoice {
    id: string;
    status: 'Draft' | 'Sent' | 'Paid';
    
    // Core (Computed from dynamic data for system use)
    systemInvoiceNumber: string;
    systemDate: string;
    systemTotal: number;
    systemClient: string;
    currency: string;

    items: InvoiceLineItem[];
    vatRate: number;
    
    // Template Reference
    templateId: string;
    templateData?: string; // Snapshot
    templateStructure?: InvoiceStructure; // Snapshot of schema at creation time
    
    // Dynamic Data (Keyed by Field ID)
    dynamicValues: Record<string, string>;
    
    // Layout Overrides
    contentTopOffset: number;
    contentLeftOffset: number;
    
    // Display & Content
    fitOnePage?: boolean;
    headerText?: string;
    footerText?: string;
    fontSize?: 'small' | 'medium' | 'large';
}

export interface Briefing {
  summary: string;
  urgentCount: number;
  financialAlerts: string[];
  generatedAt: string;
}

export interface LogEntry {
  id: string;
  content: string;
  timestamp: string;
  source: 'Slack' | 'Email';
}

export interface InboxAnalysisResult {
  receipts: ReceiptData[];
  tasks: ActionItem[];
  events: CalendarEvent[];
}

export interface ReconciliationSuggestion {
    transactionId: string;
    receiptId: string;
    confidence: number;
    reasoning: string;
}

export interface ActivityLogEntry {
    id: string;
    tool: ViewState;
    action: 'IMPORT' | 'EXPORT' | 'EDIT' | 'DELETE' | 'CREATE';
    details: string;
    timestamp: string;
}

export interface ScreenshotItem {
    id: string;
    timestamp: string;
    view: ViewState;
    imageData: string;
    label: string;
    sizeBytes: number;
}
