
import React, { useState, useEffect, useCallback } from 'react';
import { ViewState } from '../types';
import { ChevronRight, ChevronLeft, X, Sparkles, Zap } from 'lucide-react';

interface GuideStep {
    targetId: string;
    title: string;
    content: string;
    view: ViewState;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: GuideStep[] = [
    {
        targetId: 'nav-dashboard',
        title: 'Mission Control',
        content: 'Your daily executive briefing. Track burn rate, urgent tasks, and AI-summarized updates here.',
        view: ViewState.DASHBOARD,
        position: 'right'
    },
    {
        targetId: 'dashboard-kpi',
        title: 'Financial Pulse',
        content: 'Real-time financial health. We automatically normalize multi-currency data (USD, EUR, SEK) into your base currency.',
        view: ViewState.DASHBOARD,
        position: 'bottom'
    },
    {
        targetId: 'nav-capture-btn',
        title: 'Universal Capture',
        content: 'The most powerful tool here. Click this to screenshot ANY app, receipt, or email. The AI extracts data instantly.',
        view: ViewState.DASHBOARD,
        position: 'right'
    },
    {
        targetId: 'nav-finance',
        title: 'Accounting & Ledger',
        content: 'Drop receipts here. The AI auto-matches them against your bank feed to reconcile expenses.',
        view: ViewState.FINANCE,
        position: 'right'
    },
    {
        targetId: 'nav-ops',
        title: 'Operations Brain',
        content: 'Paste messy meeting notes or email threads here. We turn them into calendar events and action items.',
        view: ViewState.OPS,
        position: 'right'
    },
    {
        targetId: 'nav-settings',
        title: 'Connect Sources',
        content: 'Link your Gmail, Google Drive, or Local Folders to feed the AI engine with your business data.',
        view: ViewState.DASHBOARD,
        position: 'right'
    }
];

interface OnboardingGuideProps {
    isOpen: boolean;
    onClose: () => void;
    currentView: ViewState;
    onNavigate: (view: ViewState) => void;
}

export const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ isOpen, onClose, currentView, onNavigate }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);

    const step = STEPS[currentStepIndex];

    const findTarget = useCallback(() => {
        const element = document.getElementById(step.targetId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Wait for scroll to finish slightly
            setTimeout(() => {
                const newRect = element.getBoundingClientRect();
                setRect(newRect);
            }, 400);
        } else {
            // Element missing? Retry once then just center screen if fails
            console.warn(`Guide target ${step.targetId} not found.`);
        }
    }, [step.targetId]);

    useEffect(() => {
        if (!isOpen) return;

        // 1. Check View
        if (currentView !== step.view) {
            setIsNavigating(true);
            setRect(null); // Hide highlight while moving
            onNavigate(step.view);
            // Allow time for component mount / transition
            const timer = setTimeout(() => {
                setIsNavigating(false);
            }, 600); // Wait for React to render the new view
            return () => clearTimeout(timer);
        }

        // 2. If View is correct, Find Target
        if (!isNavigating) {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(findTarget, 300);
            return () => clearTimeout(timer);
        }

    }, [currentStepIndex, isOpen, step, currentView, onNavigate, isNavigating, findTarget]);

    // Handle Window Resize
    useEffect(() => {
        const handleResize = () => findTarget();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [findTarget]);

    if (!isOpen) return null;

    const handleNext = () => {
        if (currentStepIndex < STEPS.length - 1) {
            setCurrentStepIndex(prev => prev + 1);
        } else {
            onClose();
        }
    };

    const handlePrev = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1);
        }
    };

    // Style for the spotlight effect (The dark overlay with a hole)
    // We use a massive box-shadow on the highlight div to darken everything else.
    const spotlightStyle: React.CSSProperties = rect ? {
        position: 'fixed',
        top: rect.top - 8,
        left: rect.left - 8,
        width: rect.width + 16,
        height: rect.height + 16,
        borderRadius: '16px',
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.85)', // The Backdrop
        zIndex: 60,
        pointerEvents: 'none', // Allow clicks to pass through? No, usually we want to block interactions during tour.
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
    } : { display: 'none' };

    const tooltipStyle: React.CSSProperties = rect ? {
        position: 'fixed',
        zIndex: 70,
        // Simple positioning logic
        top: step.position === 'bottom' ? rect.bottom + 24 : step.position === 'top' ? rect.top - 200 : rect.top,
        left: step.position === 'right' ? rect.right + 24 : step.position === 'left' ? rect.left - 340 : rect.left,
        transition: 'all 0.5s ease-out',
    } : {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 70
    };

    return (
        <div className="fixed inset-0 z-[60] overflow-hidden" aria-live="polite">
            
            {/* The Spotlight Cutout */}
            <div style={spotlightStyle} className="border-2 border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.3)] animate-pulse-slow" />

            {/* The Guide Card */}
            <div 
                className="w-80 bg-zinc-900 border border-zinc-700 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300"
                style={tooltipStyle}
            >
                <div className="flex justify-between items-start">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        {currentStepIndex === 0 ? <Sparkles className="w-5 h-5 text-white" /> : <Zap className="w-5 h-5 text-white" />}
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div>
                    <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                        {step.content}
                    </p>
                </div>

                <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/10">
                    <span className="text-xs font-mono text-zinc-500">
                        {currentStepIndex + 1} / {STEPS.length}
                    </span>
                    <div className="flex gap-2">
                        {currentStepIndex > 0 && (
                            <button 
                                onClick={handlePrev} 
                                className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        )}
                        <button 
                            onClick={handleNext}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-indigo-600/20"
                        >
                            {currentStepIndex === STEPS.length - 1 ? 'Finish' : 'Next'}
                            {currentStepIndex !== STEPS.length - 1 && <ChevronRight className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
