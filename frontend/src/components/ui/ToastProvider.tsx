/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useToastStore } from '@/store/toastStore';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export const ToastProvider = () => {
    const { toasts } = useToastStore();

    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 w-full max-w-[90vw] sm:max-w-md items-center pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => (
                    (() => {
                        const tone =
                            toast.type === 'error'
                                ? {
                                    iconWrap: 'text-red-400',
                                    icon: <AlertCircle className="h-4 w-4 shrink-0" />,
                                    className: 'bg-[#16171b]/96 text-zinc-50 shadow-[0_16px_42px_rgba(18,19,24,0.58)]',
                                }
                                : toast.type === 'info'
                                    ? {
                                        iconWrap: 'border border-sky-500/30 bg-sky-500/12 text-sky-300',
                                        icon: <Info className="h-4 w-4 shrink-0" />,
                                        className: 'bg-[#16171b]/96 text-zinc-50 border border-sky-500/30 shadow-[0_16px_42px_rgba(7,24,38,0.45)]',
                                    }
                                    : {
                                        iconWrap: 'border border-emerald-500/30 bg-emerald-500/12 text-emerald-300',
                                        icon: <CheckCircle2 className="h-4 w-4 shrink-0" />,
                                        className: 'bg-[#16171b]/96 text-zinc-50 border border-emerald-500/28 shadow-[0_16px_42px_rgba(6,24,18,0.42)]',
                                    };
                        return (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: -20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.94 }}
                        className={`pointer-events-auto flex min-w-[240px] items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-md ${tone.className}`}
                    >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${tone.iconWrap}`}>
                            {tone.icon}
                        </span>
                        <span className="pr-1 text-[13px] font-semibold tracking-tight text-zinc-100">{toast.message}</span>
                    </motion.div>
                        );
                    })()
                ))}
            </AnimatePresence>
        </div>
    );
};


