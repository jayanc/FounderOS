
import React, { useState, useRef, useEffect } from 'react';
import { Camera, Download, Save, X, Trash2, Check, Loader2, Image as ImageIcon, Monitor, Layers, Video } from 'lucide-react';
import { ViewState, ScreenshotItem } from '../types';
import { storageService } from '../services/storageService';

interface CaptureToolProps {
    currentView: ViewState;
    isOpen: boolean;
    onClose: () => void;
    onImport?: (file: File) => void;
}

export const CaptureTool: React.FC<CaptureToolProps> = ({ currentView, isOpen, onClose, onImport }) => {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [snaps, setSnaps] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'capture' | 'review'>('capture');
    const videoRef = useRef<HTMLVideoElement>(null);

    // Cleanup stream on unmount or close
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [stream]);

    const startCapture = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" } as any,
                audio: false
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
            // Listen for user stopping sharing via browser UI
            mediaStream.getVideoTracks()[0].onended = () => {
                stopCapture();
            };
        } catch (err) {
            console.error("Error starting capture:", err);
        }
    };

    const stopCapture = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const takeSnapshot = () => {
        if (videoRef.current && stream) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                setSnaps(prev => [...prev, dataUrl]);
            }
        }
    };

    const handleImport = (dataUrl: string) => {
        if (!onImport) return;
        
        // Convert Base64 to File
        fetch(dataUrl)
            .then(res => res.blob())
            .then(blob => {
                const file = new File([blob], `Screen_Capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
                onImport(file);
                onClose();
            });
    };

    const handleDownload = (dataUrl: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `Capture_${Date.now()}.jpg`;
        link.click();
    };

    const handleClear = () => {
        setSnaps([]);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-zinc-950 border border-zinc-800 w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <Monitor className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg">Universal Capture</h3>
                            <p className="text-xs text-zinc-400">Navigate to any app or tab, scroll, and snap.</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {stream && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-xs font-bold animate-pulse">
                                <Video className="w-3 h-3" /> Live
                            </div>
                        )}
                        <button onClick={() => { stopCapture(); onClose(); }} className="p-2 text-zinc-500 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-zinc-800 bg-black/20 px-6">
                     <button 
                        onClick={() => setActiveTab('capture')}
                        className={`py-4 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'capture' ? 'border-indigo-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                     >
                         <Camera className="w-4 h-4" /> Live Stream
                     </button>
                     <button 
                        onClick={() => setActiveTab('review')}
                        className={`py-4 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'review' ? 'border-indigo-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                     >
                         <Layers className="w-4 h-4" /> Snaps ({snaps.length})
                     </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative bg-zinc-900/30 flex">
                    {activeTab === 'capture' && (
                        <div className="flex-1 flex flex-col h-full relative">
                            {/* Video Area */}
                            <div className="flex-1 bg-black flex items-center justify-center overflow-hidden relative">
                                {!stream ? (
                                    <div className="text-center p-10 max-w-md">
                                        <Monitor className="w-16 h-16 text-zinc-700 mx-auto mb-6" />
                                        <h2 className="text-xl font-bold text-white mb-2">Share Screen to Start</h2>
                                        <p className="text-zinc-400 mb-8">Select a window, application, or browser tab. You can navigate and scroll freely while FounderOS watches.</p>
                                        <button 
                                            onClick={startCapture}
                                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 flex items-center gap-2 mx-auto"
                                        >
                                            <Camera className="w-5 h-5" /> Start Sharing
                                        </button>
                                    </div>
                                ) : (
                                    <video 
                                        ref={videoRef} 
                                        autoPlay 
                                        playsInline 
                                        muted 
                                        className="max-w-full max-h-full object-contain shadow-2xl"
                                    />
                                )}
                            </div>

                            {/* Controls Overlay */}
                            {stream && (
                                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900/90 border border-zinc-700 p-2 rounded-2xl shadow-2xl backdrop-blur-md">
                                    <button 
                                        onClick={takeSnapshot}
                                        className="px-6 py-3 bg-white hover:bg-zinc-200 text-black rounded-xl font-bold flex items-center gap-2 shadow-lg transition-transform active:scale-95"
                                    >
                                        <Camera className="w-5 h-5" /> Snap Frame
                                    </button>
                                    <div className="w-px h-8 bg-zinc-700"></div>
                                    <button 
                                        onClick={() => { stopCapture(); setActiveTab('review'); }}
                                        className="px-4 py-3 text-white hover:text-indigo-400 font-medium text-sm transition-colors"
                                    >
                                        Finish & Review ({snaps.length})
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'review' && (
                        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-white">Review Snaps</h2>
                                {snaps.length > 0 && (
                                    <button onClick={handleClear} className="text-rose-400 text-sm hover:underline">Clear All</button>
                                )}
                            </div>
                            
                            {snaps.length === 0 ? (
                                <div className="text-center py-20 text-zinc-500">
                                    <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                    <p>No snapshots taken yet.</p>
                                    <button onClick={() => setActiveTab('capture')} className="text-indigo-400 mt-2 hover:underline">Go back to Capture</button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {snaps.map((snap, idx) => (
                                        <div key={idx} className="group relative bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-all shadow-lg">
                                            <div className="aspect-video bg-black flex items-center justify-center overflow-hidden">
                                                <img src={snap} alt={`Snap ${idx}`} className="w-full h-full object-contain" />
                                            </div>
                                            <div className="p-4 flex justify-between items-center bg-zinc-900 relative z-10">
                                                <span className="text-xs text-zinc-500 font-mono">IMG_{idx + 1}.jpg</span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleDownload(snap)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white" title="Download">
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                    {onImport && (
                                                        <button 
                                                            onClick={() => handleImport(snap)} 
                                                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-lg shadow-indigo-600/20"
                                                        >
                                                            Import <Check className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
