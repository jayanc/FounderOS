
import { User, StorageProviderType, StorageStats, DeviceTier, ActivityLogEntry, ViewState, ScreenshotItem, AppSettings } from "../types";
import { db, storage, auth } from "../firebaseConfig";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";

const STORAGE_KEYS = {
    ACTIVITY_LOG: 'founder_os_activity_log',
    SCREENSHOTS: 'founder_os_screenshots',
    SYSTEM_USERS: 'founder_os_system_users'
};

class StorageService {
    private provider: StorageProviderType = 'GCS'; // Default to Cloud
    private saveQueue: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private _deviceTier: DeviceTier = 'Mid-Range';

    constructor() {
        this._deviceTier = this.detectDeviceTier();
    }

    configure(user: User) {
        // Firebase auto-configures based on logged in user
    }

    private detectDeviceTier(): DeviceTier {
        const navigatorAny = navigator as any;
        const memory = navigatorAny.deviceMemory || 4; 
        const concurrency = navigator.hardwareConcurrency || 4; 
        if (memory >= 8 && concurrency >= 8) return 'High-End';
        if (memory < 4 || concurrency < 4) return 'Low-End';
        return 'Mid-Range';
    }

    // --- HELPER: Get Current User ID ---
    private get uid(): string {
        return auth.currentUser?.uid || 'guest';
    }

    // --- USER MANAGEMENT (Firebase Auth + Firestore) ---

    // Get all users (Admin only - typically controlled by Firestore Security Rules)
    async getSystemUsers(): Promise<User[]> {
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        } catch (e) {
            console.error("Error fetching users:", e);
            return [];
        }
    }

    async saveSystemUser(user: User): Promise<void> {
        // In Firebase, basic auth profile is handled by Auth, extra data in Firestore
        // We save the extended profile to 'users' collection
        try {
            const userRef = doc(db, "users", user.id || this.uid);
            await setDoc(userRef, user, { merge: true });
        } catch (e) {
            console.error("Error saving user profile:", e);
            throw e;
        }
    }

    async deleteSystemUser(userId: string): Promise<void> {
        try {
            await deleteDoc(doc(db, "users", userId));
        } catch (e) {
            console.error("Error deleting user:", e);
            throw e;
        }
    }

    // --- PASSWORD & IDENTITY ---
    // These are now handled directly by Firebase Auth SDK in the UI component,
    // but we keep the interface methods for compatibility if needed.
    
    async initiatePasswordReset(email: string): Promise<boolean> {
        // Handled in Auth.tsx via sendPasswordResetEmail
        return true; 
    }

    // --- DATA PERSISTENCE (Firestore) ---

    // Debounced Save
    save(key: string, data: any): void {
        const debounceMs = 2000; // Increased debounce for network
        if (this.saveQueue.has(key)) {
            clearTimeout(this.saveQueue.get(key)!);
        }

        const timeout = setTimeout(async () => {
            await this.performCloudSave(key, data);
            this.saveQueue.delete(key);
        }, debounceMs);

        this.saveQueue.set(key, timeout);
    }

    private async performCloudSave(key: string, data: any) {
        if (!auth.currentUser) return; // Don't save if not logged in

        try {
            // OPTIMIZATION: Extract Base64 Images to Cloud Storage
            // Firestore has a 1MB limit per document. We must offload images.
            let processedData = data;
            
            if (Array.isArray(data)) {
                processedData = await Promise.all(data.map(async (item) => {
                    // Check for large image fields (receipts, screenshots)
                    if (item.imageUrl && item.imageUrl.startsWith('data:')) {
                        const url = await this.uploadBase64ToStorage(item.imageUrl, `images/${this.uid}/${crypto.randomUUID()}.jpg`);
                        return { ...item, imageUrl: url };
                    }
                    if (item.imageData && item.imageData.startsWith('data:')) {
                         const url = await this.uploadBase64ToStorage(item.imageData, `images/${this.uid}/${crypto.randomUUID()}.jpg`);
                         return { ...item, imageData: url };
                    }
                    return item;
                }));
            }

            // Save JSON to Firestore
            // Structure: users/{uid}/modules/{moduleKey}
            const docRef = doc(db, "users", this.uid, "modules", key);
            
            // If data is array, wrap it. Firestore root must be object.
            const payload = Array.isArray(processedData) ? { items: processedData } : processedData;
            
            await setDoc(docRef, payload);
            console.log(`[Cloud] Synced ${key}`);

        } catch (e) {
            console.error(`[Cloud] Save failed for ${key}`, e);
        }
    }

    private async uploadBase64ToStorage(base64: string, path: string): Promise<string> {
        try {
            const storageRef = ref(storage, path);
            await uploadString(storageRef, base64, 'data_url');
            return await getDownloadURL(storageRef);
        } catch (e) {
            console.error("Image upload failed, keeping base64", e);
            return base64; // Fallback
        }
    }

    async load<T>(key: string): Promise<T[]> {
        if (!auth.currentUser) return [];
        try {
            const docRef = doc(db, "users", this.uid, "modules", key);
            const snapshot = await getDoc(docRef);
            if (snapshot.exists()) {
                const data = snapshot.data();
                // Unwrap if it was an array stored as { items: [...] }
                return (data.items || data) as T[];
            }
            return [];
        } catch (e) {
            console.error(`[Cloud] Load failed for ${key}`, e);
            return [];
        }
    }

    async getStats(): Promise<StorageStats> {
        // Approximate stats for Cloud
        return {
            usageBytes: 0, // Difficult to calculate exact bytes without cloud function
            quotaBytes: 1024 * 1024 * 1024, // 1GB Free Tier
            percentUsed: 0,
            tier: this._deviceTier,
            recommendedLimitBytes: 1024 * 1024 * 1024
        };
    }

    async clearUserCache(type: string) {
        if (!auth.currentUser) return;
        await deleteDoc(doc(db, "users", this.uid, "modules", type));
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
        // Just fire and forget a save to the activity log collection
        // We handle this differently: separate collection for logs to avoid massive documents
        try {
             if (!auth.currentUser) return;
             // We'll append to the local array logic for now to keep UI simple, 
             // but in real app this should be `addDoc(collection(db, 'logs'), entry)`
             this.save(STORAGE_KEYS.ACTIVITY_LOG, [entry]); // Simplified for compatibility
        } catch(e) {}
    }

    getHistory(tool?: ViewState): ActivityLogEntry[] {
        // This is synchronous in the current UI, but Firestore is async.
        // For now, return empty array or locally cached.
        // Real implementation requires refactoring UI to await history.
        return []; 
    }

    // --- BACKUP ---

    async exportAllData(): Promise<string> {
        // Implementation would fetch all collections for user
        return JSON.stringify({ meta: "Cloud Export" });
    }

    async importAllData(jsonString: string): Promise<boolean> {
        return true; 
    }
}

export const storageService = new StorageService();
