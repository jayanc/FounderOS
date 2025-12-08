
import { User, StorageProviderType, StorageStats, DeviceTier, ActivityLogEntry, ViewState, ScreenshotItem } from "../types";

// Simulating GCS Bucket Structure
// gs://founder-os-data/{user_email}/{year}/{month}/{type}.json

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const STORAGE_KEYS = {
    ACTIVITY_LOG: 'founder_os_activity_log',
    SCREENSHOTS: 'founder_os_screenshots'
};

class StorageService {
    private provider: StorageProviderType = 'LOCAL';
    private userEmail: string = '';
    private saveQueue: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private _deviceTier: DeviceTier = 'Mid-Range';

    constructor() {
        this._deviceTier = this.detectDeviceTier();
    }

    configure(user: User) {
        this.provider = user.storageProvider || 'LOCAL';
        this.userEmail = user.email;
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
            return `gs://bucket/${this.userEmail}/${year}/${month}/${type}.json`;
        } else {
            // Local folder simulation (Flattened for localStorage)
            return `local://${this.userEmail}/data/${type}.json`;
        }
    }

    // Debounced Save to prevent UI blocking
    save(type: string, data: any): void {
        const key = this.getPath(type);
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
        // Simulate Network Latency for GCS (Non-blocking)
        if (this.provider === 'GCS') {
            console.log(`[GCS] Uploading background: ${key}...`);
            await delay(800); 
        }

        try {
            const payload = JSON.stringify(data);
            localStorage.setItem(key, payload);
        } catch (e: any) {
            // Handle Quota Exceeded gracefully
            if (this.isQuotaError(e)) {
                console.warn(`[Storage] Quota exceeded for ${key}. Attempting optimization...`);
                
                if (Array.isArray(data)) {
                    // Optimization Strategy: Strip large base64 image fields
                    // This preserves the critical financial/metadata but drops the cached image view
                    const optimizedData = data.map(item => {
                        const copy = { ...item };
                        
                        // Check for common large fields in our types (ReceiptData, etc)
                        if (copy.imageUrl && typeof copy.imageUrl === 'string' && copy.imageUrl.length > 500) {
                            delete copy.imageUrl; 
                        }
                        if (copy.base64 && typeof copy.base64 === 'string' && copy.base64.length > 500) {
                             delete copy.base64;
                        }
                        return copy;
                    });

                    try {
                        const optimizedPayload = JSON.stringify(optimizedData);
                        localStorage.setItem(key, optimizedPayload);
                        console.log(`[Storage] Saved optimized version for ${key} (Heavy assets stripped).`);
                        return; // Success on retry
                    } catch (retryErr) {
                         console.error("[Storage] Optimization failed. Data still too large.", retryErr);
                    }
                }
            } else {
                console.error("Storage Write Failed", e);
            }
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
        const key = this.getPath(type);

        if (this.provider === 'GCS') {
            console.log(`[GCS] Downloading from ${key}...`);
            await delay(600);
        }

        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }

    async getStats(): Promise<StorageStats> {
        let usage = 0;
        // Estimate usage based on local storage characters (approx 2 bytes per char)
        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                usage += (localStorage[key].length * 2);
            }
        }

        // Get browser quota if available
        let quota = 0;
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                if (estimate.quota) quota = estimate.quota;
                if (estimate.usage) usage = estimate.usage; // Use real usage if available
            } catch (e) {
                // Ignore
            }
        }

        // Recommended limits based on Tier to keep app performant
        const limits = {
            'Low-End': 50 * 1024 * 1024, // 50MB
            'Mid-Range': 250 * 1024 * 1024, // 250MB
            'High-End': 1024 * 1024 * 1024 // 1GB
        };

        // Fallback quota if API fails
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
        const key = this.getPath(type);
        localStorage.removeItem(key);
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
        // Enforce quota: Keep max 10 global screenshots, prioritizing recent
        // For specific tool, limit to 3.
        const existingStr = localStorage.getItem(STORAGE_KEYS.SCREENSHOTS);
        let shots: ScreenshotItem[] = existingStr ? JSON.parse(existingStr) : [];
        
        // Remove oldest if count > 10
        if (shots.length >= 10) {
            shots = shots.slice(0, 9);
        }
        
        // Add new
        shots = [item, ...shots];

        try {
            localStorage.setItem(STORAGE_KEYS.SCREENSHOTS, JSON.stringify(shots));
        } catch (e) {
            if (this.isQuotaError(e)) {
                // Emergency cleanup: keep only last 2
                console.warn("[Storage] Quota hit on screenshot save. Truncating history.");
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