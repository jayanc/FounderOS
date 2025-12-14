
import { User, StorageProviderType, StorageStats, DeviceTier, ActivityLogEntry, ViewState, ScreenshotItem, AppSettings } from "../types";

// Simulating GCS Bucket Structure
// gs://founder-os-data/{user_email}/{year}/{month}/{type}.json

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const STORAGE_KEYS = {
    ACTIVITY_LOG: 'founder_os_activity_log',
    SCREENSHOTS: 'founder_os_screenshots',
    SYSTEM_USERS: 'founder_os_system_users' // New key for user directory
};

const MODULE_KEYS = [
    'founder_os_receipts',
    'founder_os_bank_txs',
    'founder_os_tasks',
    'founder_os_events',
    'founder_os_accounts',
    'founder_os_settings',
    'founder_os_activity_log',
    'founder_os_screenshots',
    'founder_os_timesheets',
    'founder_os_contracts',
    'founder_os_plans',
    'founder_os_invoices',
    'founder_os_invoice_templates'
];

class StorageService {
    private provider: StorageProviderType = 'LOCAL';
    private userEmail: string = '';
    private saveQueue: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private _deviceTier: DeviceTier = 'Mid-Range';
    private gcpConfig: AppSettings['gcpConfig'] | undefined;

    constructor() {
        this._deviceTier = this.detectDeviceTier();
    }

    configure(user: User) {
        this.provider = user.storageProvider || 'LOCAL';
        this.userEmail = user.email;
        // Load GCP Config from settings if available
        const settingsStr = localStorage.getItem('founder_os_settings');
        if (settingsStr) {
            const settings: AppSettings = JSON.parse(settingsStr);
            this.gcpConfig = settings.gcpConfig;
            if (this.gcpConfig && this.gcpConfig.autoSync) {
                this.provider = 'GCS';
            }
        }
    }

    private detectDeviceTier(): DeviceTier {
        // Safe access to experimental/non-standard APIs
        const navigatorAny = navigator as any;
        const memory = navigatorAny.deviceMemory || 4; // GB, default to mid-range
        const concurrency = navigator.hardwareConcurrency || 4; // Cores

        if (memory >= 8 && concurrency >= 8) return 'High-End';
        if (memory < 4 || concurrency < 4) return 'Low-End';
        return 'Mid-Range';
    }

    private getPath(type: string): string {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        
        // Partition Key Construction
        if (this.provider === 'GCS') {
            return `gs://${this.gcpConfig?.bucketName || 'default-bucket'}/${this.userEmail}/${year}/${month}/${type}.json`;
        } else {
            // Local folder simulation (Flattened for localStorage)
            return type; // Simplification for localStorage to use direct key
        }
    }

    // Debounced Save to prevent UI blocking
    save(type: string, data: any): void {
        const key = type; // Use raw key for localStorage
        const debounceMs = 1000; // Wait 1s of inactivity before writing

        // Clear pending write
        if (this.saveQueue.has(key)) {
            clearTimeout(this.saveQueue.get(key)!);
        }

        // Schedule new write
        const timeout = setTimeout(async () => {
            await this.performSave(key, data);
            this.saveQueue.delete(key);
        }, debounceMs);

        this.saveQueue.set(key, timeout);
    }

    private async performSave(key: string, data: any) {
        // Always save locally first for offline-first support
        try {
            const payload = JSON.stringify(data);
            localStorage.setItem(key, payload);
        } catch (e: any) {
            // Handle Quota Exceeded gracefully
            if (this.isQuotaError(e)) {
                console.warn(`[Storage] Quota exceeded for ${key}. Attempting optimization...`);
                if (Array.isArray(data)) {
                    // Optimization Strategy: Strip large base64 image fields
                    const optimizedData = data.map(item => {
                        const copy = { ...item };
                        if (copy.imageUrl && typeof copy.imageUrl === 'string' && copy.imageUrl.length > 500) delete copy.imageUrl; 
                        if (copy.base64 && typeof copy.base64 === 'string' && copy.base64.length > 500) delete copy.base64;
                        return copy;
                    });
                    try {
                        const optimizedPayload = JSON.stringify(optimizedData);
                        localStorage.setItem(key, optimizedPayload);
                        console.log(`[Storage] Saved optimized version for ${key} (Heavy assets stripped).`);
                        return; 
                    } catch (retryErr) {
                         console.error("[Storage] Optimization failed. Data still too large.", retryErr);
                    }
                }
            } else {
                console.error("Storage Write Failed", e);
            }
        }

        // SYNC TO GCP IF CONFIGURED
        if (this.provider === 'GCS' && this.gcpConfig?.bucketName) {
            // NOTE: In a browser environment without a backend proxy, standard GCS JSON API calls 
            // usually require an OAuth token. For this demo, we simulate the network call structure.
            // In a real app, this would perform a fetch to a signed URL or API endpoint.
            
            console.log(`[GCS Sync] Uploading ${key} to gs://${this.gcpConfig.bucketName}...`);
            
            // Simulation of latency
            await delay(1200); 
            
            // Example structure of what a real call might look like:
            // const url = `https://storage.googleapis.com/upload/storage/v1/b/${this.gcpConfig.bucketName}/o?uploadType=media&name=${this.userEmail}/${key}.json`;
            // await fetch(url, { method: 'POST', body: JSON.stringify(data), headers: { Authorization: `Bearer ${token}` } });
        }
    }

    private isQuotaError(e: any): boolean {
        return e instanceof DOMException && (
            e.code === 22 ||
            e.code === 1014 ||
            e.name === 'QuotaExceededError' ||
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        );
    }

    async load<T>(type: string): Promise<T[]> {
        // In an offline-first model, we load from local storage immediately
        // Background sync could perform a "Check for updates" from GCS here
        const data = localStorage.getItem(type);
        
        if (this.provider === 'GCS' && !data) {
             // If local is empty but we are in GCS mode, we might try to fetch
             console.log(`[GCS Sync] Attempting to hydrate ${type} from cloud...`);
             await delay(500); 
             // Logic to fetch from cloud would go here
        }

        return data ? JSON.parse(data) : [];
    }

    async getStats(): Promise<StorageStats> {
        let usage = 0;
        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                usage += (localStorage[key].length * 2);
            }
        }

        let quota = 0;
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                if (estimate.quota) quota = estimate.quota;
                if (estimate.usage) usage = estimate.usage; 
            } catch (e) {}
        }

        const limits = {
            'Low-End': 50 * 1024 * 1024, 
            'Mid-Range': 250 * 1024 * 1024, 
            'High-End': 1024 * 1024 * 1024 
        };

        if (!quota) quota = limits[this._deviceTier] * 2; 

        return {
            usageBytes: usage,
            quotaBytes: quota,
            percentUsed: (usage / quota) * 100,
            tier: this._deviceTier,
            recommendedLimitBytes: limits[this._deviceTier]
        };
    }

    async clearUserCache(type: string) {
        localStorage.removeItem(type);
    }

    // --- USER DIRECTORY MANAGEMENT ---

    getSystemUsers(): User[] {
        const raw = localStorage.getItem(STORAGE_KEYS.SYSTEM_USERS);
        return raw ? JSON.parse(raw) : [];
    }

    saveSystemUser(user: User) {
        const users = this.getSystemUsers();
        const existingIdx = users.findIndex(u => u.id === user.id || u.email === user.email);
        
        if (existingIdx >= 0) {
            users[existingIdx] = { ...users[existingIdx], ...user };
        } else {
            users.push(user);
        }
        
        localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(users));
        this.logActivity(ViewState.ADMIN, 'CREATE', `Updated system user: ${user.email}`);
    }

    deleteSystemUser(userId: string) {
        const users = this.getSystemUsers();
        const filtered = users.filter(u => u.id !== userId);
        localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(filtered));
        this.logActivity(ViewState.ADMIN, 'DELETE', `Deleted system user ID: ${userId}`);
    }

    // --- EXPORT / IMPORT CENTRAL ---

    async exportAllData(): Promise<string> {
        const fullDump: Record<string, any> = {};
        
        // 1. Gather all module data
        for (const key of MODULE_KEYS) {
            const raw = localStorage.getItem(key);
            if (raw) {
                try {
                    fullDump[key] = JSON.parse(raw);
                } catch(e) {
                    console.error(`Failed to export ${key}`, e);
                }
            }
        }

        // 2. Add Metadata
        fullDump['meta'] = {
            exportedAt: new Date().toISOString(),
            userEmail: this.userEmail,
            version: '1.0'
        };

        return JSON.stringify(fullDump, null, 2);
    }

    async importAllData(jsonString: string): Promise<boolean> {
        try {
            const dump = JSON.parse(jsonString);
            
            // Validate basic structure
            if (!dump['meta']) throw new Error("Invalid backup file: Missing metadata");

            // Restore keys
            for (const key of Object.keys(dump)) {
                if (key !== 'meta' && MODULE_KEYS.includes(key)) {
                    localStorage.setItem(key, JSON.stringify(dump[key]));
                }
            }
            return true;
        } catch (e) {
            console.error("Import failed", e);
            return false;
        }
    }

    // --- ACTIVITY LOGGING ---

    logActivity(tool: ViewState, action: ActivityLogEntry['action'], details: string) {
        const entry: ActivityLogEntry = {
            id: crypto.randomUUID(),
            tool,
            action,
            details,
            timestamp: new Date().toISOString()
        };

        const existingLogsStr = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOG);
        const logs: ActivityLogEntry[] = existingLogsStr ? JSON.parse(existingLogsStr) : [];
        const updatedLogs = [entry, ...logs].slice(0, 1000);
        localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOG, JSON.stringify(updatedLogs));
    }

    getHistory(tool?: ViewState): ActivityLogEntry[] {
        const logsStr = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOG);
        if (!logsStr) return [];
        const logs: ActivityLogEntry[] = JSON.parse(logsStr);
        if (tool) {
            return logs.filter(l => l.tool === tool);
        }
        return logs;
    }

    // --- SCREENSHOTS ---

    saveScreenshot(item: ScreenshotItem) {
        const existingStr = localStorage.getItem(STORAGE_KEYS.SCREENSHOTS);
        let shots: ScreenshotItem[] = existingStr ? JSON.parse(existingStr) : [];
        
        if (shots.length >= 10) shots = shots.slice(0, 9);
        shots = [item, ...shots];

        try {
            localStorage.setItem(STORAGE_KEYS.SCREENSHOTS, JSON.stringify(shots));
        } catch (e) {
            if (this.isQuotaError(e)) {
                const emergencyShots = [item, ...shots.slice(1, 2)];
                localStorage.setItem(STORAGE_KEYS.SCREENSHOTS, JSON.stringify(emergencyShots));
            }
        }
    }

    getScreenshots(view?: ViewState): ScreenshotItem[] {
        const existingStr = localStorage.getItem(STORAGE_KEYS.SCREENSHOTS);
        if (!existingStr) return [];
        const shots: ScreenshotItem[] = JSON.parse(existingStr);
        if (view) {
            return shots.filter(s => s.view === view);
        }
        return shots;
    }
    
    deleteScreenshot(id: string) {
        const existingStr = localStorage.getItem(STORAGE_KEYS.SCREENSHOTS);
        if (!existingStr) return;
        const shots: ScreenshotItem[] = JSON.parse(existingStr);
        const updated = shots.filter(s => s.id !== id);
        localStorage.setItem(STORAGE_KEYS.SCREENSHOTS, JSON.stringify(updated));
    }
}

export const storageService = new StorageService();
