
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// TODO: Replace with your actual Firebase Project Configuration
// You get this from Firebase Console -> Project Settings -> General -> Your Apps
const firebaseConfig = {
  apiKey: process.env.API_KEY || "YOUR_FIREBASE_API_KEY", // Using the same env var for convenience in this demo
  authDomain: "founder-os-demo.firebaseapp.com",
  projectId: "founder-os-demo",
  storageBucket: "founder-os-demo.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
