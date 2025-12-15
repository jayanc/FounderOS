
import { User, StorageProviderType, StorageStats, DeviceTier, ActivityLogEntry, ViewState, ScreenshotItem, AppSettings } from "../types";
import { db, storage, auth } from "../firebaseConfig";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { sendPasswordResetEmail } from "firebase/auth";

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

    // --- HELPER: Sanitize Payload for Firestore ---
    // Firestore rejects 'undefined' values. We must replace them with null or remove them.
    private sanitizePayload(obj: any): any {
        if (obj === null || obj === undefined) return null;
        if (typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(v => this.sanitizePayload(v));
        
        const newObj: any = {};
        for (const key in obj) {
            const val = obj[key];
            if (val === undefined) {
                newObj[key] = null; // Explicitly set to null to avoid Firestore errors
            } else {
                newObj[key] = this.sanitizePayload(val);
            }
        }
        return newObj;
    }

    // --- USER MANAGEMENT (Firebase Auth + Firestore) ---

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
        try {
            const userRef = doc(db, "users", user.id || this.uid);
            
            // Use sanitization to ensure no undefined fields break the save
            const safeUser = this.sanitizePayload({
                ...user,
                // Ensure defaults for critical fields if missing in source
                allowedModules: user.allowedModules || [],
                status: user.status || 'Active',
                role: user.role || 'User',
                lastActive: user.lastActive || new Date().toISOString()
            });

            await setDoc(userRef, safeUser, { merge: true });
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

    // --- INVITE & VERIFICATION FLOW ---
    
    async sendUserInvite(user: User): Promise<void> {
        if (!user.email) throw new Error("User has no email");

        // 1. Trigger Password Reset Email (Functions as an invite for existing auth system)
        try {
            await sendPasswordResetEmail(auth, user.email);
        } catch (e: any) {
            // Ignore if user not found in Auth (we might just be creating the record first)
            // But usually this sends the email if the auth record exists. 
            // If it doesn't, real implementation needs Firebase Admin SDK to create auth user.
            console.warn("Could not send auth email (user might not exist in Auth yet):", e.message);
        }

        // 2. Update Firestore Record to track invite status
        const updates: Partial<User> = {
            status: 'Pending Validation',
            verificationSentAt: new Date().toISOString()
        };
        
        // We use saveSystemUser to ensure robust merging and sanitization
        await this.saveSystemUser({ ...user, ...updates });
    }

    async initiatePasswordReset(email: string): Promise<boolean> {
        try {
            await sendPasswordResetEmail(auth, email);
            return true;
        } catch (e) {
            console.error("Password reset failed", e);
            return false;
        }
    }

    // --- DATA PERSISTENCE (Firestore) ---

    // Debounced Save
    save(key: string, data: any): void {
        const debounceMs = 2000;
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
        if (!auth.currentUser) return;

        try {
            // Process images out of payload to avoid size limits
            let processedData = data;
            if (Array.isArray(data)) {
                processedData = await Promise.all(data.map(async (item) => {
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

            const docRef = doc(db, "users", this.uid, "modules", key);
            // Sanitize the entire payload before saving
            const safePayload = this.sanitizePayload(Array.isArray(processedData) ? { items: processedData } : processedData);
            
            await setDoc(docRef, safePayload);
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
                return (data.items || data) as T[];
            }
            return [];
        } catch (e) {
            console.error(`[Cloud] Load failed for ${key}`, e);
            return [];
        }
    }

    async getStats(): Promise<StorageStats> {
        return {
            usageBytes: 0,
            quotaBytes: 1024 * 1024 * 1024,
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
        try {
             if (!auth.currentUser) return;
             this.save(STORAGE_KEYS.ACTIVITY_LOG, [entry]); 
        } catch(e) {}
    }

    getHistory(tool?: ViewState): ActivityLogEntry[] {
        return []; 
    }

    // --- BACKUP ---

    async exportAllData(): Promise<string> {
        return JSON.stringify({ meta: "Cloud Export" });
    }

    async importAllData(jsonString: string): Promise<boolean> {
        return true; 
    }
}

export const storageService = new StorageService();
