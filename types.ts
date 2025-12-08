
export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  FINANCE = 'FINANCE',
  OPS = 'OPS',
  TIMESHEETS = 'TIMESHEETS',
  CONTRACTS = 'CONTRACTS',
  SETTINGS = 'SETTINGS'
}

export type IntegrationType = 'Gmail' | 'Outlook' | 'GDrive' | 'Local';

export type StorageProviderType = 'LOCAL' | 'GCS';

export type DeviceTier = 'High-End' | 'Mid-Range' | 'Low-End';

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
  email: string;
  name: string;
  mfaVerified: boolean;
  storageProvider?: StorageProviderType;
}

export interface IntegrationAccount {
  id: string;
  name: string; // Email address or Folder Name
  provider: IntegrationType;
  isConnected: boolean;
  type: 'Personal' | 'Work';
  lastSynced?: string;
  apiConfig?: ApiConfig; // Optional real credentials
}

export interface ReceiptData {
  id: string;
  vendor: string;
  amount: number;
  currency: string; // e.g., SEK, USD
  vatAmount?: number; // Important for Swedish accounting
  date: string;
  category: string;
  description: string; // Business event description
  taxDeductible: boolean;
  notes: string;
  imageUrl?: string;
  sourceUrl?: string; // Reference to GDrive link or Email ID or Local Path
  matchConfidence: number; // 0-100
  source?: string; // Display string (e.g. "Gmail", "GDrive")
  tags?: string[];
}

export interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number; // Negative for expenses, Positive for income
  currency: string;
  matchedReceiptId?: string; // ID of the receipt if reconciled
  status: 'Reconciled' | 'Unreconciled' | 'Ignored' | 'Pending';
  matchType?: 'Exact' | 'AI' | 'Manual'; // New field for match origin
  comments?: string;
  aiSuggestion?: string; // "High confidence match with receipt #123 because..."
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
  attachments?: { name: string, path: string }[]; // Links to Drive or Local
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
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
  sourceUrl?: string; // Path to file
  imageUrl?: string; // For preview if it's an image
  uploadDate: string;
  status?: 'Review' | 'Validated';
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
    imageData: string; // Base64 JPEG
    label: string;
    sizeBytes: number;
}
