
import React, { useState, useEffect } from 'react';
import { Cloud, Cpu, Server, Laptop, Activity } from 'lucide-react';

interface ProcessingStatusProps {
  isProcessing: boolean;
  taskName: string;
  progress?: number; // 0-100. If undefined, shows indeterminate state.
  mode: 'CLOUD' | 'LOCAL' | 'HYBRID';
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ isProcessing, taskName, progress, mode }) => {
  const [metrics, setMetrics] = useState({
    localCpu: 0,
    localMem: 0,
    cloudCpu: 0,
    cloudMem: 0
  });

  useEffect(() => {
    if (!isProcessing) return;

    // Simulate metrics update based on the mode
    const interval = setInterval(() => {
      setMetrics(prev => {
        // Targets based on mode
        // CLOUD: Low Local CPU, High Cloud TPU
        // LOCAL: High Local CPU, Low Cloud TPU
        
        const targetLocalCpu = mode === 'LOCAL' || mode === 'HYBRID' ? 45 + Math.random() * 40 : 5 + Math.random() * 15;
        const targetLocalMem = mode === 'LOCAL' ? 60 + Math.random() * 20 : 25 + Math.random() * 5;
        
        const targetCloudCpu = mode === 'CLOUD' || mode === 'HYBRID' ? 70 + Math.random() * 25 : 0;
        const targetCloudMem = mode === 'CLOUD' || mode === 'HYBRID' ? 50 + Math.random() * 30 : 0;
        
        return {
           localCpu: Math.floor(targetLocalCpu),
           localMem: Math.floor(targetLocalMem),
           cloudCpu: Math.floor(targetCloudCpu),
           cloudMem: Math.floor(targetCloudMem)
        };
      });
    }, 800);

    return () => clearInterval(interval);
  }, [isProcessing, mode]);

  if (!isProcessing) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-5 shadow-2xl w-[90vw] max-w-[420px] animate-in slide-in-from-bottom-10 fade-in duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
             <div className="relative">
                 <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping opacity-75" />
                 <div className="relative bg-zinc-900 p-2.5 rounded-full border border-zinc-700 shadow-inner">
                     {mode === 'CLOUD' ? <Cloud className="w-5 h-5 text-indigo-400" /> : 
                      mode === 'LOCAL' ? <Laptop className="w-5 h-5 text-emerald-400" /> :
                      <Activity className="w-5 h-5 text-amber-400" />
                     }
                 </div>
             </div>
             <div>
                 <p className="text-sm font-bold text-white tracking-tight">{taskName}</p>
                 <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider font-semibold">
                     {mode === 'CLOUD' ? 'Remote Inference • Gemini 2.5' : mode === 'LOCAL' ? 'On-Device Processing • WebWorker' : 'Hybrid Pipeline'}
                 </p>
             </div>
        </div>
        <span className="text-xs font-mono font-bold text-white bg-zinc-800 px-2 py-1 rounded-md border border-zinc-700">
            {progress !== undefined ? `${Math.round(progress)}%` : <Loader2 className="w-3 h-3 animate-spin"/>}
        </span>
      </div>

      {/* Main Progress Bar */}
      <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden mb-5 border border-zinc-800/50">
          {progress !== undefined ? (
               <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ width: `${progress}%` }} />
          ) : (
               <div className="h-full w-1/3 bg-indigo-500/50 animate-[shimmer_1.5s_infinite] rounded-full relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_1s_infinite]" />
               </div>
          )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-6 border-t border-white/5 pt-4">
          {/* Local Stats */}
          <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  <Laptop className="w-3 h-3" /> Local System
              </div>
              
              {/* Local CPU */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                    <span>CPU Load</span>
                    <span className={`font-mono ${metrics.localCpu > 60 ? 'text-amber-400' : 'text-zinc-300'}`}>{metrics.localCpu}%</span>
                </div>
                <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-700 ease-out ${metrics.localCpu > 60 ? 'bg-amber-500' : 'bg-emerald-500/50'}`} style={{width: `${metrics.localCpu}%`}} />
                </div>
              </div>

              {/* Local Memory */}
               <div>
                <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                    <span>Memory</span>
                    <span className="font-mono text-zinc-300">{metrics.localMem}%</span>
                </div>
                <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                     <div className="h-full bg-emerald-500/30 transition-all duration-700 ease-out" style={{width: `${metrics.localMem}%`}} />
                </div>
               </div>
          </div>

          {/* Cloud Stats */}
          <div className="space-y-2.5 border-l border-white/5 pl-6">
               <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  <Server className="w-3 h-3" /> Cloud Cluster
              </div>
               
               {/* Cloud TPU */}
               <div>
                <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                    <span>TPU Usage</span>
                    <span className={`font-mono ${metrics.cloudCpu > 80 ? 'text-indigo-300' : 'text-zinc-300'}`}>{metrics.cloudCpu}%</span>
                </div>
                <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-700 ease-out ${metrics.cloudCpu > 80 ? 'bg-indigo-400' : 'bg-indigo-500/40'}`} style={{width: `${metrics.cloudCpu}%`}} />
                </div>
               </div>

               {/* Cloud VRAM */}
               <div>
                <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                    <span>VRAM Alloc</span>
                    <span className="font-mono text-zinc-300">{metrics.cloudMem}%</span>
                </div>
                <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                     <div className="h-full bg-purple-500/40 transition-all duration-700 ease-out" style={{width: `${metrics.cloudMem}%`}} />
                </div>
               </div>
          </div>
      </div>
    </div>
  );
};

// Simple loader icon for indeterminate state fallback
import { Loader2 } from 'lucide-react';
