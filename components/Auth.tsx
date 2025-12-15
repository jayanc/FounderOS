
import React, { useState } from 'react';
import { User } from '../types';
import { auth, db } from '../firebaseConfig';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    sendPasswordResetEmail, 
    updateProfile,
    User as FirebaseUser 
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Lock, Mail, ArrowRight, ShieldCheck, User as UserIcon, RefreshCw, History, AlertTriangle } from 'lucide-react';

interface AuthProps {
  onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot_password'>('login');
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleAuthSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setError(null);
      setSuccessMsg(null);

      try {
          if (authMode === 'signup') {
              const userCredential = await createUserWithEmailAndPassword(auth, email, password);
              const fbUser = userCredential.user;
              
              // Update Display Name
              await updateProfile(fbUser, { displayName: name });

              // Create User Document in Firestore
              const newUser: User = {
                  id: fbUser.uid,
                  email: fbUser.email!,
                  name: name,
                  mfaVerified: false,
                  role: 'Admin', // Default to Admin for first user
                  storageProvider: 'GCS'
              };
              
              await setDoc(doc(db, "users", fbUser.uid), newUser);
              
              onLogin(newUser);
          } 
          else if (authMode === 'login') {
              const userCredential = await signInWithEmailAndPassword(auth, email, password);
              const fbUser = userCredential.user;
              
              // Fetch extended profile
              const userDoc = await getDoc(doc(db, "users", fbUser.uid));
              
              if (userDoc.exists()) {
                  onLogin(userDoc.data() as User);
              } else {
                  // Fallback if doc missing
                  onLogin({
                      id: fbUser.uid,
                      email: fbUser.email!,
                      name: fbUser.displayName || 'User',
                      mfaVerified: false,
                      role: 'User'
                  });
              }
          }
      } catch (err: any) {
          console.error(err);
          // Map Firebase Errors to User Friendly Messages
          if (err.code === 'auth/invalid-credential') setError("Invalid email or password.");
          else if (err.code === 'auth/email-already-in-use') setError("Email already registered.");
          else if (err.code === 'auth/weak-password') setError("Password should be at least 6 characters.");
          else setError("Authentication failed. Please try again.");
      }
      setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!email) return setError("Please enter your email.");
      
      setIsLoading(true);
      try {
          await sendPasswordResetEmail(auth, email);
          setSuccessMsg("Reset link sent! Check your inbox.");
          setTimeout(() => setAuthMode('login'), 5000);
      } catch (err: any) {
          setError(err.message);
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-sans">
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="absolute -top-32 -right-32 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none"></div>
            
            <div className="mb-8 text-center relative z-10">
                <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-indigo-500/20 ring-1 ring-white/10">
                    <ShieldCheck className="text-white w-7 h-7" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">FounderOS Cloud</h1>
                <p className="text-zinc-500 text-sm mt-2">Secure Cloud Access</p>
            </div>

            <div className="animate-in fade-in slide-in-from-right-4 relative z-10">
                {authMode === 'forgot_password' ? (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div className="text-center mb-4">
                            <h3 className="text-white font-medium">Reset Password</h3>
                            <p className="text-xs text-zinc-400">We'll send a recovery link to your email.</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">Email Address</label>
                            <div className="relative group">
                                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                                <input 
                                    type="email" 
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-zinc-700 transition-all"
                                    placeholder="name@company.com"
                                />
                            </div>
                        </div>
                        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                        {successMsg && <p className="text-emerald-400 text-xs text-center">{successMsg}</p>}
                        
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setAuthMode('login')} className="w-full py-3 bg-zinc-800 text-zinc-300 rounded-xl text-sm hover:bg-zinc-700">Cancel</button>
                            <button type="submit" disabled={isLoading} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-500">
                                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin mx-auto"/> : "Send Link"}
                            </button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleAuthSubmit} className="space-y-4">
                        {authMode === 'signup' && (
                            <div className="animate-in slide-in-from-top-2">
                                <label className="block text-xs font-medium text-zinc-400 mb-1">Full Name</label>
                                <div className="relative group">
                                    <UserIcon className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                                    <input 
                                        type="text" 
                                        required
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-zinc-700 transition-all"
                                        placeholder="Alex Founder"
                                    />
                                </div>
                            </div>
                        )}
                        
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">Email Address</label>
                            <div className="relative group">
                                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                                <input 
                                    type="email" 
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-zinc-700 transition-all"
                                    placeholder="name@company.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                                <input 
                                    type="password" 
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-zinc-700 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                            {authMode === 'login' && (
                                <button type="button" onClick={() => setAuthMode('forgot_password')} className="text-[10px] text-indigo-400 hover:underline mt-1 block text-right">
                                    Forgot Password?
                                </button>
                            )}
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-center flex items-center justify-center gap-2">
                                <AlertTriangle className="w-3 h-3" /> {error}
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className={`w-full font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg ${
                                authMode === 'signup' 
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20' 
                            }`}
                        >
                            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : authMode === 'signup' ? <>Create Account <ArrowRight className="w-4 h-4" /></> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
                        </button>
                    </form>
                )}

                <div className="mt-6 text-center">
                    <button 
                        onClick={() => {
                            setAuthMode(authMode === 'login' ? 'signup' : 'login');
                            setError(null);
                        }}
                        className="text-xs text-zinc-500 hover:text-white transition-colors"
                    >
                        {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};
