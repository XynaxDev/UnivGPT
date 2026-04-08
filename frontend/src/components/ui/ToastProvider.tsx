/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useToastStore } from '@/store/toastStore';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export const ToastProvider = () => {
    const { toasts, removeToast } = useToastStore();

    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 w-full max-w-[90vw] sm:max-w-md items-center pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => (
                    (() => {
                        const tone =
                            toast.type === 'error'
                                ? {
                                    icon: <AlertTriangle className="w-4 h-4 shrink-0 text-red-200" />,
                                    className: 'bg-red-950/90 text-red-50 border border-red-500/35 shadow-[0_12px_36px_rgba(127,29,29,0.45)]',
                                }
                                : toast.type === 'info'
                                    ? {
                                        icon: <Info className="w-4 h-4 shrink-0 text-sky-200" />,
                                        className: 'bg-sky-950/90 text-sky-50 border border-sky-500/30 shadow-[0_12px_36px_rgba(8,47,73,0.38)]',
                                    }
                                    : {
                                        icon: <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-200" />,
                                        className: 'bg-emerald-950/90 text-emerald-50 border border-emerald-500/30 shadow-[0_12px_36px_rgba(6,78,59,0.38)]',
                                    };
                        return (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: -20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.94 }}
                        className={`pointer-events-auto px-4 py-2.5 rounded-xl backdrop-blur-md flex items-center gap-2.5 w-auto min-w-[220px] ${tone.className}`}
                    >
                        {tone.icon}
                        <span className="text-[13px] font-bold tracking-tight pr-1">{toast.message}</span>
                    </motion.div>
                        );
                    })()
                ))}
            </AnimatePresence>
        </div>
    );
};


