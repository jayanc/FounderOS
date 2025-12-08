
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Lock, Mail, ArrowRight, ShieldCheck, QrCode, RefreshCw, User as UserIcon, LogIn, UserPlus, Fingerprint, History } from 'lucide-react';
import { securityService } from '../services/securityService';
import * as OTPAuth from 'otpauth';

interface AuthProps {
  onLogin: (user: User) => void;
}

const STORAGE_KEYS = {
    USER_META: 'founder_os_user_meta', // Public metadata (email, salt)
    USER_VAULT: 'founder_os_user_vault' // Encrypted user details
};

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'unlock'>('signup');
  const [step, setStep] = useState<'auth' | 'mfa_setup' | 'mfa_verify'>('auth');
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stored Meta for "Unlock" mode
  const [storedMeta, setStoredMeta] = useState<{email: string, salt: string, name: string} | null>(null);

  // MFA State
  const [mfaMethod, setMfaMethod] = useState<'app' | 'email'>('app');
  const [totp, setTotp] = useState<OTPAuth.TOTP | null>(null);
  const [secret, setSecret] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [showEmailToast, setShowEmailToast] = useState(false);

  // 1. Check for existing user on mount
  useEffect(() => {
      const metaStr = localStorage.getItem(STORAGE_KEYS.USER_META);
      if (metaStr) {
          const meta = JSON.parse(metaStr);
          setStoredMeta(meta);
          setAuthMode('unlock');
          setEmail(meta.email); // Pre-fill
      }
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setError(null);

      try {
          if (authMode === 'signup') {
              // 1. Generate Security Context
              const salt = securityService.generateSalt();
              await securityService.deriveKey(password);

              // 2. Encrypt Sensitive Data
              const userData = { name, email, createdAt: new Date().toISOString() };
              const encryptedVault = await securityService.encrypt(JSON.stringify(userData));

              // 3. Store Public Meta & Encrypted Vault
              localStorage.setItem(STORAGE_KEYS.USER_META, JSON.stringify({ email, name, salt }));
              localStorage.setItem(STORAGE_KEYS.USER_VAULT, encryptedVault);

              setStep('mfa_setup'); // Proceed to MFA
          } 
          else if (authMode === 'unlock') {
              if (!storedMeta) throw new Error("No user found");
              
              // 1. Load Salt & Derive Key
              securityService.loadSalt(storedMeta.salt);
              await securityService.deriveKey(password);

              // 2. Try to Decrypt Vault
              const vaultStr = localStorage.getItem(STORAGE_KEYS.USER_VAULT);
              if (!vaultStr) throw new Error("Vault corrupted");

              const decryptedJson = await securityService.decrypt(vaultStr);
              
              if (decryptedJson) {
                  const userData = JSON.parse(decryptedJson);
                  // Check if MFA is configured (simulated in Vault or Meta)
                  const mfaSecret = localStorage.getItem(`mfa_${email}`);
                  
                  if (mfaSecret) {
                       const secretObj = OTPAuth.Secret.fromBase32(mfaSecret);
                       const loadedTotp = new OTPAuth.TOTP({
                            issuer: "FounderOS",
                            label: email,
                            algorithm: "SHA1",
                            digits: 6,
                            period: 30,
                            secret: secretObj
                        });
                        setTotp(loadedTotp);
                        setStep('mfa_verify');
                  } else {
                      // No MFA? Just login (or force setup) - for demo we login
                      onLogin({
                          email: userData.email,
                          name: userData.name,
                          mfaVerified: false
                      });
                  }
              } else {
                  setError("Incorrect password. Decryption failed.");
                  setIsLoading(false);
                  return;
              }
          }
          else if (authMode === 'login') {
              // Legacy/Cloud login simulation (not primary path now)
              alert("Please use 'Create Account' for local-first storage or 'Unlock' if you have data.");
              setIsLoading(false);
              return;
          }
      } catch (err) {
          console.error(err);
          setError("Authentication failed.");
      }
      setIsLoading(false);
  };

  const setupMFA = () => {
    if (mfaMethod === 'app') {
        const newSecret = new OTPAuth.Secret({ size: 20 });
        const newTotp = new OTPAuth.TOTP({
            issuer: "FounderOS",
            label: email,
            algorithm: "SHA1",
            digits: 6,
            period: 30,
            secret: newSecret
        });
        
        setTotp(newTotp);
        setSecret(newSecret.base32);
        
        // Persist MFA secret (In real app, encrypt this too!)
        localStorage.setItem(`mfa_${email}`, newSecret.base32);
    } else {
        const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
        setEmailCode(randomCode);
        setShowEmailToast(true);
        setTimeout(() => setShowEmailToast(false), 8000); 
    }
    setStep('mfa_verify');
  };

  const handleVerify = (e: React.FormEvent) => {
      e.preventDefault();
      if (code.length < 6) return;
      setIsLoading(true);

      let isValid = false;
      if (mfaMethod === 'app' && totp) {
          const delta = totp.validate({ token: code, window: 1 });
          isValid = delta !== null;
      } else {
          isValid = code === emailCode;
      }
      
      setTimeout(() => {
          if (isValid) {
              onLogin({
                  email,
                  name: name || storedMeta?.name || email.split('@')[0],
                  mfaVerified: true
              });
          } else {
              setError("Invalid code.");
              setIsLoading(false);
              setCode('');
          }
      }, 800);
  };

  const handleReset = () => {
      if(confirm("This will wipe all local data to allow a new account. Continue?")) {
          localStorage.clear();
          window.location.reload();
      }
  };

  const qrCodeUrl = totp 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totp.toString())}`
    : '';

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative font-sans">
        {/* Email Toast Simulation */}
        {showEmailToast && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 z-50 max-w-sm w-full">
                <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                    <p className="text-sm font-semibold">New Email from FounderOS</p>
                    <p className="text-xs text-zinc-400 mt-1">Your verification code is: <span className="text-white font-mono font-bold text-lg">{emailCode}</span></p>
                </div>
            </div>
        )}

        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute -top-32 -right-32 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none"></div>
            
            <div className="mb-8 text-center relative z-10">
                <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-indigo-500/20 ring-1 ring-white/10">
                    <Lock className="text-white w-7 h-7" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">FounderOS</h1>
                <p className="text-zinc-500 text-sm mt-2">Local-First Business Intelligence</p>
            </div>

            {step === 'auth' && (
                <div className="animate-in fade-in slide-in-from-right-4 relative z-10">
                    
                    {authMode === 'unlock' && (
                        <div className="mb-6 bg-indigo-900/20 border border-indigo-500/20 p-4 rounded-xl flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 font-bold text-lg">
                                {storedMeta?.name.charAt(0)}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-white">Welcome back, {storedMeta?.name}</p>
                                <p className="text-xs text-zinc-400">{storedMeta?.email}</p>
                            </div>
                            <Fingerprint className="w-5 h-5 text-indigo-400 opacity-50" />
                        </div>
                    )}

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
                        
                        {authMode !== 'unlock' && (
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
                        )}

                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">
                                {authMode === 'unlock' ? 'Unlock Password' : 'Master Password'}
                            </label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                                <input 
                                    type="password" 
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-zinc-700 transition-all"
                                    placeholder={authMode === 'signup' ? "Create a strong vault password" : "Enter vault password"}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-center animate-in shake">
                                {error}
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className={`w-full font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg ${
                                authMode === 'signup' 
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20' 
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                            }`}
                        >
                            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : authMode === 'signup' ? <>Create Secure Vault <ArrowRight className="w-4 h-4" /></> : <>Unlock Vault <ArrowRight className="w-4 h-4" /></>}
                        </button>
                    </form>

                    {authMode === 'unlock' && (
                        <button onClick={handleReset} className="w-full mt-4 text-xs text-zinc-600 hover:text-red-400 transition-colors flex items-center justify-center gap-2">
                            <History className="w-3 h-3" /> Reset Device / Create New Account
                        </button>
                    )}
                    
                    {authMode === 'signup' && (
                        <p className="text-[10px] text-zinc-500 text-center mt-4 px-4 leading-relaxed">
                            Your password encrypts your data locally using AES-GCM. 
                            <br/>We <b>cannot</b> recover your password if lost.
                        </p>
                    )}
                </div>
            )}

            {step === 'mfa_setup' && (
                <div className="animate-in fade-in slide-in-from-right-4 space-y-6 relative z-10">
                    <div className="text-center">
                        <h3 className="text-white font-medium">Secure Your Account</h3>
                        <p className="text-xs text-zinc-400 mt-1">Choose a Multi-Factor Authentication method.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => setMfaMethod('app')}
                            className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${mfaMethod === 'app' ? 'bg-indigo-600/10 border-indigo-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}
                        >
                            <QrCode className="w-6 h-6" />
                            <span className="text-xs font-medium">Authenticator</span>
                        </button>
                        <button 
                             onClick={() => setMfaMethod('email')}
                            className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${mfaMethod === 'email' ? 'bg-indigo-600/10 border-indigo-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}
                        >
                            <Mail className="w-6 h-6" />
                            <span className="text-xs font-medium">Email Code</span>
                        </button>
                    </div>

                    <button 
                        onClick={setupMFA}
                        className="w-full bg-zinc-100 hover:bg-white text-black font-medium py-3 rounded-xl transition-all shadow-lg"
                    >
                        Continue
                    </button>
                </div>
            )}

            {step === 'mfa_verify' && (
                <form onSubmit={handleVerify} className="animate-in fade-in slide-in-from-right-4 space-y-6 text-center relative z-10">
                    <div>
                         {mfaMethod === 'app' ? (
                             <div className="w-48 h-48 bg-white p-2 rounded-xl mx-auto mb-4 shadow-xl">
                                 {qrCodeUrl && <img src={qrCodeUrl} alt="MFA QR" className="w-full h-full object-contain" />}
                             </div>
                         ) : (
                             <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-700">
                                 <Mail className="w-8 h-8 text-indigo-400" />
                             </div>
                         )}
                         
                         <h3 className="text-white font-medium">Enter Confirmation Code</h3>
                         <p className="text-xs text-zinc-400 mt-1 max-w-[280px] mx-auto">
                             {mfaMethod === 'app' 
                                ? "Scan the QR code with Google Authenticator or Authy." 
                                : `We sent a code to ${email}.`}
                         </p>
                         
                         {mfaMethod === 'app' && (
                             <div className="mt-4 text-[10px] text-zinc-500 font-mono bg-black/40 py-1.5 px-3 rounded-lg inline-block border border-zinc-800">
                                 Secret: {secret}
                             </div>
                         )}

                         {mfaMethod === 'email' && (
                             <button 
                                type="button" 
                                onClick={() => {
                                    setShowEmailToast(true);
                                    setTimeout(() => setShowEmailToast(false), 5000);
                                }} 
                                className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1 mx-auto"
                             >
                                 <RefreshCw className="w-3 h-3" /> Resend Code
                             </button>
                         )}
                    </div>

                    <div className="flex justify-center gap-2">
                        <input 
                            type="text" 
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0,6))}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl w-40 py-3 text-center text-3xl tracking-[0.2em] text-white focus:outline-none focus:border-indigo-500 font-mono shadow-inner"
                            placeholder="000000"
                            autoFocus
                        />
                    </div>

                    {error && <p className="text-red-400 text-xs">{error}</p>}

                    <button 
                        type="submit" 
                        disabled={code.length < 6 || isLoading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                    >
                        {isLoading ? "Verifying..." : <>Confirm & Trust Device <ShieldCheck className="w-4 h-4" /></>}
                    </button>
                </form>
            )}
        </div>
    </div>
  );
};
