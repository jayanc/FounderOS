
import React, { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { Camera, Download, Save, X, Trash2, Check, Loader2, Image as ImageIcon, Maximize2 } from 'lucide-react';
import { ViewState, ScreenshotItem } from '../types';
import { storageService } from '../services/storageService';

interface CaptureToolProps {
    currentView: ViewState;
    isOpen: boolean;
    onClose: () => void;
}

export const CaptureTool: React.FC<CaptureToolProps> = ({ currentView, isOpen, onClose }) => {
    const [isCapturing, setIsCapturing] = useState(false);
    const [previewData, setPreviewData] = useState<string | null>(null);
    const [gallery, setGallery] = useState<ScreenshotItem[]>([]);
    const [activeTab, setActiveTab] = useState<'capture' | 'gallery'>('capture');
    const [selectedImage, setSelectedImage] = useState<ScreenshotItem | null>(null);

    useEffect(() => {
        if (isOpen) {
            refreshGallery();
        }
    }, [isOpen, currentView]);

    const refreshGallery = () => {
        const shots = storageService.getScreenshots(currentView);
        setGallery(shots);
    };

    const handleCapture = async () => {
        setIsCapturing(true);
        // Small delay to allow UI to settle
        await new Promise(r => setTimeout(r, 300));

        const element = document.querySelector('main'); 
        if (!element) {
            setIsCapturing(false);
            return;
        }

        try {
            const canvas = await html2canvas(element, {
                useCORS: true,
                scale: 1, // Optimize size
                logging: false,
                scrollY: -window.scrollY,
                height: element.scrollHeight,
                windowHeight: element.scrollHeight,
                backgroundColor: '#09090b' // Match background
            });

            const base64 = canvas.toDataURL('image/jpeg', 0.7); // 70% quality JPEG for storage
            setPreviewData(base64);
        } catch (e) {
            console.error("Capture failed", e);
            alert("Failed to capture screen.");
        } finally {
            setIsCapturing(false);
        }
    };

    const handleSave = () => {
        if (!previewData) return;

        // Calculate rough size
        const sizeBytes = Math.round((previewData.length * 3) / 4);
        
        const newItem: ScreenshotItem = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            view: currentView,
            imageData: previewData,
            label: `${currentView} Snapshot`,
            sizeBytes
        };

        storageService.saveScreenshot(newItem);
        storageService.logActivity(currentView, 'CREATE', 'Captured screen snapshot');
        
        refreshGallery();
        setActiveTab('gallery');
        setPreviewData(null);
    };

    const handleDownload = (dataUrl: string, filename: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        link.click();
    };

    const handleDelete = (id: string) => {
        storageService.deleteScreenshot(id);
        refreshGallery();
        if (selectedImage?.id === id) setSelectedImage(null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-zinc-950 border border-zinc-800 w-full max-w-4xl h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <Camera className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg">Visual History</h3>
                            <p className="text-xs text-zinc-400">Manage snapshots for <span className="text-indigo-400 font-mono">{currentView}</span></p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-zinc-800 bg-black/20 px-6">
                     <button 
                        onClick={() => setActiveTab('capture')}
                        className={`py-4 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'capture' ? 'border-indigo-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                     >
                         <Camera className="w-4 h-4" /> New Capture
                     </button>
                     <button 
                        onClick={() => setActiveTab('gallery')}
                        className={`py-4 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'gallery' ? 'border-indigo-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                     >
                         <ImageIcon className="w-4 h-4" /> Gallery ({gallery.length})
                     </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative bg-zinc-900/30">
                    {activeTab === 'capture' && (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                            {!previewData ? (
                                <div className="space-y-6 max-w-md">
                                    <div className="w-24 h-24 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-700 shadow-xl">
                                        <Maximize2 className="w-10 h-10 text-zinc-500" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-white">Capture Full View</h2>
                                    <p className="text-zinc-400">
                                        This will scroll through the entire current page and stitch it into a single high-quality image.
                                        Perfect for archiving monthly timesheets or long contracts.
                                    </p>
                                    <button 
                                        onClick={handleCapture}
                                        disabled={isCapturing}
                                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02]"
                                    >
                                        {isCapturing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
                                        {isCapturing ? "Processing Document..." : "Start Capture"}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col h-full w-full gap-4">
                                    <div className="flex-1 bg-black/50 rounded-2xl border border-zinc-700 overflow-auto p-4 custom-scrollbar shadow-inner relative">
                                        <img src={previewData} alt="Preview" className="w-full h-auto rounded shadow-lg" />
                                    </div>
                                    <div className="flex justify-between items-center bg-zinc-900/80 p-4 rounded-2xl border border-zinc-800">
                                        <button onClick={() => setPreviewData(null)} className="text-zinc-400 hover:text-white px-4 py-2 hover:bg-white/5 rounded-lg transition-colors">Discard</button>
                                        <div className="flex gap-3">
                                            <button 
                                                onClick={() => handleDownload(previewData, `FounderOS_${currentView}_${Date.now()}.jpg`)} 
                                                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium flex items-center gap-2 border border-zinc-700"
                                            >
                                                <Download className="w-4 h-4" /> Download
                                            </button>
                                            <button 
                                                onClick={handleSave} 
                                                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                                            >
                                                <Check className="w-4 h-4" /> Save to Gallery
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'gallery' && (
                        <div className="h-full flex overflow-hidden">
                             {/* Thumbnails */}
                             <div className="w-1/3 border-r border-zinc-800 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                 {gallery.length === 0 && (
                                     <div className="text-center py-10 text-zinc-500 italic">No snapshots yet.</div>
                                 )}
                                 {gallery.map(shot => (
                                     <div 
                                        key={shot.id} 
                                        onClick={() => setSelectedImage(shot)}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedImage?.id === shot.id ? 'bg-indigo-600/10 border-indigo-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}
                                     >
                                         <div className="aspect-video bg-black rounded-lg mb-2 overflow-hidden border border-white/5">
                                             <img src={shot.imageData} alt="thumb" className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" />
                                         </div>
                                         <div className="flex justify-between items-center">
                                             <div>
                                                 <p className="text-sm font-medium text-zinc-200">{new Date(shot.timestamp).toLocaleDateString()}</p>
                                                 <p className="text-xs text-zinc-500">{(shot.sizeBytes / 1024).toFixed(0)} KB</p>
                                             </div>
                                             {selectedImage?.id === shot.id && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                                         </div>
                                     </div>
                                 ))}
                             </div>

                             {/* Detail View */}
                             <div className="w-2/3 bg-black/40 p-6 flex flex-col items-center justify-center relative">
                                 {selectedImage ? (
                                     <div className="flex flex-col h-full w-full">
                                          <div className="flex-1 overflow-auto custom-scrollbar flex items-center justify-center bg-zinc-900/50 rounded-xl border border-white/5 mb-4 p-4 shadow-inner">
                                              <img src={selectedImage.imageData} alt="Detail" className="max-w-full max-h-none rounded shadow-2xl" />
                                          </div>
                                          <div className="flex justify-between items-center">
                                              <p className="text-sm text-zinc-400 font-mono">{new Date(selectedImage.timestamp).toLocaleString()}</p>
                                              <div className="flex gap-3">
                                                  <button onClick={() => handleDelete(selectedImage.id)} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"><Trash2 className="w-5 h-5"/></button>
                                                  <button 
                                                    onClick={() => handleDownload(selectedImage.imageData, `FounderOS_Archive_${selectedImage.id}.jpg`)}
                                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm flex items-center gap-2"
                                                  >
                                                      <Download className="w-4 h-4" /> Export
                                                  </button>
                                              </div>
                                          </div>
                                     </div>
                                 ) : (
                                     <div className="text-zinc-600 flex flex-col items-center gap-2">
                                         <ImageIcon className="w-12 h-12 opacity-20" />
                                         <p>Select a snapshot to view details</p>
                                     </div>
                                 )}
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
