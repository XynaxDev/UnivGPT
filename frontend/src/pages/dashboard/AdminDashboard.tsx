/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */


import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users,
    FileText,
    Shield,
    MessageSquare,
    ArrowUpRight,
    Activity,
    Bot,
    X,
    User,
    Brain,
    TrendingUp,
    Plus,
    ArrowUp,
    AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { adminApi, systemApi, type AuditLogEntry, type MetricsResponse } from '@/lib/api';
import { HoverTooltip } from '@/components/ui/tooltip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const formatCompact = (value: number) =>
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
        Number.isFinite(value) ? value : 0,
    );

const formatDateLabel = (isoDate: string) => {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return isoDate;
    return parsed.toLocaleDateString('en-US', { weekday: 'short' });
};

const formatRelativeTime = (value?: string) => {
    if (!value) return 'just now';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'just now';
    const diffMs = Date.now() - parsed.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
};

type SevenDayPoint = {
    date: string;
    queries: number;
    uploads: number;
    admin: number;
    auth: number;
};

function InteractiveBarChart({ series }: { series: SevenDayPoint[] }) {
    const safeSeries =
        series.length > 0
            ? series
            : [
                  { date: 'Mon', queries: 0, uploads: 0, admin: 0, auth: 0 },
                  { date: 'Tue', queries: 0, uploads: 0, admin: 0, auth: 0 },
                  { date: 'Wed', queries: 0, uploads: 0, admin: 0, auth: 0 },
                  { date: 'Thu', queries: 0, uploads: 0, admin: 0, auth: 0 },
                  { date: 'Fri', queries: 0, uploads: 0, admin: 0, auth: 0 },
                  { date: 'Sat', queries: 0, uploads: 0, admin: 0, auth: 0 },
                  { date: 'Sun', queries: 0, uploads: 0, admin: 0, auth: 0 },
              ];
    const max = Math.max(
        1,
        ...safeSeries.map((point) => Math.max(point.queries || 0, point.uploads || 0)),
    );
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Weekly Activity</h3>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
                        <span className="text-[10px] text-zinc-500">Queries</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm bg-amber-500/60" />
                        <span className="text-[10px] text-zinc-500">Uploads</span>
                    </div>
                </div>
            </div>
            <div className="flex items-end gap-3 h-40">
                {safeSeries.map((point, i) => (
                    <div
                        key={`${point.date}-${i}`}
                        className="flex-1 flex flex-col items-center gap-1 justify-end h-full relative cursor-pointer"
                        onMouseEnter={() => setHoveredIdx(i)}
                        onMouseLeave={() => setHoveredIdx(null)}
                    >
                        <AnimatePresence>
                            {hoveredIdx === i && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 4 }}
                                    className="absolute -top-14 left-1/2 -translate-x-1/2 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 z-10 whitespace-nowrap shadow-xl"
                                >
                                    <div className="text-[10px] font-bold text-white">
                                        {formatDateLabel(point.date)}
                                    </div>
                                    <div className="text-[9px] text-orange-400">
                                        {point.queries || 0} queries
                                    </div>
                                    <div className="text-[9px] text-amber-400">
                                        {point.uploads || 0} uploads
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div className="w-full flex flex-col items-center gap-[2px] flex-1 justify-end">
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${((point.queries || 0) / max) * 100}%` }}
                                transition={{ delay: i * 0.05, duration: 0.45, ease: 'easeOut' }}
                                className={`w-full max-w-[18px] rounded-t-md min-h-[4px] transition-colors ${
                                    hoveredIdx === i ? 'bg-orange-400' : 'bg-orange-500'
                                }`}
                            />
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${((point.uploads || 0) / max) * 100}%` }}
                                transition={{ delay: i * 0.05 + 0.08, duration: 0.45, ease: 'easeOut' }}
                                className={`w-full max-w-[18px] rounded-t-md min-h-[2px] transition-colors ${
                                    hoveredIdx === i ? 'bg-amber-400/70' : 'bg-amber-500/50'
                                }`}
                            />
                        </div>
                        <span
                            className={`text-[9px] mt-1 transition-colors ${
                                hoveredIdx === i ? 'text-white' : 'text-zinc-600'
                            }`}
                        >
                            {formatDateLabel(point.date)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DonutChart({
    usersByRole,
}: {
    usersByRole: { student: number; faculty: number; admin: number };
}) {
    const segments = [
        { label: 'Students', value: usersByRole.student || 0, color: '#f97316' },
        { label: 'Faculty', value: usersByRole.faculty || 0, color: '#f59e0b' },
        { label: 'Admin', value: usersByRole.admin || 0, color: '#ef4444' },
    ];
    const total = segments.reduce((sum, seg) => sum + seg.value, 0);
    const circleBase = total > 0 ? total : 1;
    let cum = 0;
    const [hovered, setHovered] = useState<number | null>(null);
    const activeSegment = hovered !== null ? segments[hovered] : null;
    const activePercent = activeSegment ? Math.round((activeSegment.value / circleBase) * 100) : 100;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white">User Distribution</h3>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Live role split</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] items-center gap-5">
                <div className="relative w-36 h-36 shrink-0 mx-auto sm:mx-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90 drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]">
                        <circle
                            r="15.9"
                            cx="18"
                            cy="18"
                            fill="none"
                            stroke="rgba(255,255,255,0.07)"
                            strokeWidth="3"
                        />
                        {segments.map((segment, idx) => {
                            const dash = (segment.value / circleBase) * 100;
                            const offset = -cum;
                            cum += dash;
                            return (
                                <circle
                                    key={segment.label}
                                    r="15.9"
                                    cx="18"
                                    cy="18"
                                    fill="none"
                                    stroke={segment.color}
                                    strokeWidth="3"
                                    strokeDasharray={`${dash} ${100 - dash}`}
                                    strokeDashoffset={offset}
                                    strokeLinecap="round"
                                    className="transition-all duration-300 cursor-pointer"
                                    style={{ opacity: hovered !== null && hovered !== idx ? 0.3 : 1 }}
                                    onMouseEnter={() => setHovered(idx)}
                                    onMouseLeave={() => setHovered(null)}
                                />
                            );
                        })}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[11px] text-zinc-500 uppercase tracking-wider">
                            {activeSegment ? activeSegment.label : 'Total'}
                        </span>
                        <span className="text-2xl font-extrabold text-white leading-none">
                            {activeSegment ? activeSegment.value : total}
                        </span>
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">
                            {activePercent}% share
                        </span>
                    </div>
                </div>
                <div className="space-y-2.5 flex-1">
                    {segments.map((segment, idx) => {
                        const pct = Math.round((segment.value / circleBase) * 100);
                        return (
                            <div
                                key={segment.label}
                                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                                    hovered === idx ? 'bg-white/[0.04]' : ''
                                }`}
                                onMouseEnter={() => setHovered(idx)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-2.5 h-2.5 rounded-full"
                                            style={{ backgroundColor: segment.color }}
                                        />
                                        <span className="text-xs text-zinc-400">{segment.label}</span>
                                    </div>
                                    <div className="flex items-center gap-3 min-w-[110px] justify-end">
                                        <span className="text-[10px] text-zinc-500">{pct}%</span>
                                        <span className="text-xs font-bold text-white min-w-[18px] text-right">{segment.value}</span>
                                    </div>
                                </div>
                                <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{ width: `${pct}%`, backgroundColor: segment.color }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function AdminChatBubble() {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const { messages, isQuerying, sendQuery, newConversation, error, clearError, setScope } = useChatStore();
    const { token, user } = useAuthStore();
    const hasStreamingAssistant = messages.some((m) => m.role === 'assistant' && m.isStreaming);

    useEffect(() => {
        setScope(`admin-dashboard-bubble:${user?.id || 'anon'}`);
    }, [setScope, user?.id]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen]);

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !token || isQuerying) return;
        const question = input;
        setInput('');
        await sendQuery(token, question);
    };

    return (
        <div className="fixed bottom-6 right-6 z-50">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        className="absolute bottom-16 right-0 w-[calc(100vw-2rem)] sm:w-[420px] md:w-[460px] h-[560px] bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-orange-500/5 to-transparent shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/20">
                                    <Brain className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-white">Admin Assistant</h4>
                                    <div className="flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[9px] text-zinc-500">Ready</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-0.5">
                                <HoverTooltip content="New chat" side="left">
                                    <button
                                        onClick={() => newConversation()}
                                        className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </HoverTooltip>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>
                            {messages.length === 0 && (
                                <div className="text-center py-10 space-y-3">
                                    <div className="w-12 h-12 mx-auto rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                                        <Bot className="w-5 h-5 text-orange-400" />
                                    </div>
                                    <p className="text-xs text-zinc-500 font-medium">
                                        Ask about users, documents, logs, and system status.
                                    </p>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <div
                                        className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center mt-0.5 ${
                                            msg.role === 'user'
                                                ? 'bg-orange-500/20'
                                                : 'bg-gradient-to-br from-orange-500 to-amber-500'
                                        }`}
                                    >
                                        {msg.role === 'user' ? (
                                            <User className="w-3 h-3 text-orange-400" />
                                        ) : (
                                            <Bot className="w-3 h-3 text-white" />
                                        )}
                                    </div>
                                    <div
                                        className={`rounded-xl px-3 py-2 text-sm max-w-[82%] leading-relaxed ${
                                            msg.role === 'user'
                                                ? 'bg-orange-500/10 border border-orange-500/20 text-white'
                                                : 'bg-white/[0.04] border border-white/[0.06] text-zinc-300'
                                        }`}
                                    >
                                        {msg.role === 'user' ? (
                                            msg.content
                                        ) : (
                                            <div className="prose prose-xs prose-zinc dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1 prose-a:text-orange-400">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                                {msg.isStreaming && (
                                                    <span className="inline-block ml-1 h-[1em] align-[-0.15em] w-[2px] bg-orange-300 animate-pulse" />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {isQuerying && !hasStreamingAssistant && (
                                <div className="flex gap-2">
                                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0">
                                        <Bot className="w-3 h-3 text-white" />
                                    </div>
                                    <div className="flex gap-1 items-center px-3 py-2">
                                        {[0, 150, 300].map((delay) => (
                                            <div
                                                key={delay}
                                                className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce"
                                                style={{ animationDelay: `${delay}ms` }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div ref={endRef} />
                        </div>

                        <form onSubmit={send} className="px-3 py-2.5 border-t border-white/[0.06] shrink-0">
                            {error && (
                                <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[10px] text-red-200 flex items-start justify-between gap-2">
                                    <span className="leading-relaxed">{error}</span>
                                    <button
                                        type="button"
                                        onClick={clearError}
                                        className="text-red-300 hover:text-red-100 transition-colors font-semibold shrink-0"
                                    >
                                        x
                                    </button>
                                </div>
                            )}
                            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 focus-within:border-orange-500/30 transition-colors">
                                <input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask about users, docs, system..."
                                    className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-zinc-700"
                                    disabled={isQuerying}
                                />
                                <Button
                                    type="submit"
                                    size="icon"
                                    className="h-7 w-7 rounded-lg bg-orange-600 hover:bg-orange-500 text-white shrink-0 transition-all hover:shadow-md hover:shadow-orange-500/20 active:scale-90"
                                    disabled={!input.trim() || isQuerying}
                                >
                                    <ArrowUp className="w-3 h-3" />
                                </Button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-xl shadow-orange-500/30 text-white"
            >
                {isOpen ? <X className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
            </motion.button>
        </div>
    );
}

function MiniBarChart({ data, color, hovered }: { data: number[]; color: string; hovered: boolean }) {
    const max = Math.max(1, ...data);
    return (
        <div className="flex items-end gap-[3px] h-10 mt-2">
            {data.map((value, i) => (
                <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${(value / max) * 100}%` }}
                    transition={{ delay: i * 0.04, duration: 0.35 }}
                    className="flex-1 rounded-sm min-w-[3px] transition-colors"
                    style={{
                        backgroundColor: color,
                        opacity: hovered ? 0.45 + (value / max) * 0.55 : 0.25 + (value / max) * 0.45,
                    }}
                />
            ))}
        </div>
    );
}

const classifyAuditType = (action: string): 'auth' | 'upload' | 'admin' | 'query' => {
    const lower = action.toLowerCase();
    if (lower.includes('upload') || lower.includes('document')) return 'upload';
    if (lower.includes('login') || lower.includes('signup') || lower.includes('reset_password')) return 'auth';
    if (lower.includes('query') || lower.includes('agent')) return 'query';
    return 'admin';
};

const buildTrendText = (label: string, current: number) => {
    if (current <= 0) return `No new ${label.toLowerCase()} yet`;
    return `${current} new ${label.toLowerCase()} today`;
};

const AdminDashboard = () => {
    const { user, token } = useAuthStore();
    const firstName = user?.full_name?.split(' ')[0] || 'Admin';
    const [hoveredStat, setHoveredStat] = useState<number | null>(null);
    const cachedMetrics = token ? systemApi.peekMetrics(token) : null;
    const cachedAudit = token ? adminApi.peekAuditLogs(token, 1, 30) : null;
    const [metrics, setMetrics] = useState<MetricsResponse | null>(cachedMetrics ?? null);
    const [auditRows, setAuditRows] = useState<AuditLogEntry[]>(cachedAudit?.logs || []);
    const [isLoading, setIsLoading] = useState(!(cachedMetrics || cachedAudit));
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            if (!token) return;
            const needsMetrics = !cachedMetrics;
            const needsAudit = !cachedAudit;

            if (!needsMetrics && !needsAudit) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setLoadError(null);
            const [metricsResult, auditResult] = await Promise.allSettled([
                needsMetrics ? systemApi.metrics(token) : Promise.resolve(cachedMetrics),
                needsAudit ? adminApi.getAuditLogs(token, 1, 30) : Promise.resolve(cachedAudit),
            ]);
            if (!alive) return;

            if (metricsResult.status === 'fulfilled' && metricsResult.value) {
                setMetrics(metricsResult.value);
            } else if (needsMetrics) {
                setMetrics(null);
            }

            if (auditResult.status === 'fulfilled' && auditResult.value) {
                setAuditRows(auditResult.value.logs || []);
            } else if (needsAudit) {
                setAuditRows([]);
            }

            if (
                needsMetrics &&
                needsAudit &&
                metricsResult.status === 'rejected' &&
                auditResult.status === 'rejected'
            ) {
                const metricsErr = metricsResult.reason as Error;
                const auditErr = auditResult.reason as Error;
                setLoadError(
                    metricsErr?.message ||
                        auditErr?.message ||
                        'Unable to load admin data right now.',
                );
            } else {
                setLoadError(null);
            }
            if (alive) setIsLoading(false);
        };
        load();
        return () => {
            alive = false;
        };
    }, [token]);

    const stats = metrics?.stats || {
        total_documents: 0,
        total_embeddings: 0,
        total_conversations: 0,
        total_users: 0,
        total_chats: 0,
    };
    const timeseries = metrics?.timeseries?.last_7_days || [];
    const usersByRole = {
        student: metrics?.breakdowns?.users_by_role?.student || 0,
        faculty: metrics?.breakdowns?.users_by_role?.faculty || 0,
        admin: metrics?.breakdowns?.users_by_role?.admin || 0,
    };
    const today = timeseries[timeseries.length - 1];

    const statCards = [
        {
            label: 'Total Users',
            value: stats.total_users,
            icon: Users,
            change: buildTrendText('users', today?.auth || 0),
            color: '#f97316',
            sparkline: timeseries.map((point) => point.auth || 0),
        },
        {
            label: 'Documents',
            value: stats.total_documents,
            icon: FileText,
            change: buildTrendText('uploads', today?.uploads || 0),
            color: '#f59e0b',
            sparkline: timeseries.map((point) => point.uploads || 0),
        },
        {
            label: 'Queries',
            value: stats.total_chats,
            icon: MessageSquare,
            change: buildTrendText('queries', today?.queries || 0),
            color: '#10b981',
            sparkline: timeseries.map((point) => point.queries || 0),
        },
        {
            label: 'Embeddings',
            value: stats.total_embeddings,
            icon: Activity,
            change: 'Vector index sync status',
            color: '#3b82f6',
            sparkline: timeseries.map((point) => (point.uploads || 0) + (point.queries || 0)),
        },
    ];

    const typeStyles: Record<string, string> = {
        auth: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        upload: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        admin: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
        query: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    };

    return (
        <>
            <div className="p-5 md:p-8 space-y-6 pb-24 max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-zinc-950 via-zinc-950 to-slate-950/90 p-5 sm:p-6 md:p-10"
                >
                    <div className="absolute top-0 right-0 w-[40%] h-full bg-gradient-to-l from-orange-500/[0.06] to-transparent pointer-events-none" />
                    <div className="absolute -top-16 left-16 w-64 h-64 bg-cyan-500/[0.06] blur-[110px] rounded-full pointer-events-none" />
                    <div className="relative z-10 space-y-4 max-w-xl">
                        <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 text-[10px] font-bold tracking-widest uppercase">
                            <Shield className="w-3 h-3 mr-1.5" /> Admin Console
                        </Badge>
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight">
                            System Overview,{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">
                                {firstName}
                            </span>
                        </h1>
                        <p className="text-zinc-500 text-xs sm:text-sm">
                            Monitor live health, manage users, and review operational activity.
                        </p>
                        <div className="flex flex-wrap gap-2 sm:gap-3 pt-1">
                            <Link to="/dashboard/users">
                                <Button
                                    title="Open user management controls"
                                    className="rounded-xl h-8 sm:h-9 px-3 sm:px-4 bg-orange-600 hover:bg-orange-500 text-white text-[10px] sm:text-xs font-semibold transition-all hover:shadow-lg hover:shadow-orange-500/20 active:scale-95"
                                >
                                    <Users className="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1 sm:mr-1.5" /> Manage Users
                                </Button>
                            </Link>
                            <Link to="/dashboard/audit">
                                <Button
                                    title="Review system audit logs"
                                    variant="glass"
                                    className="rounded-xl h-8 sm:h-9 px-3 sm:px-4 text-zinc-300 text-[10px] sm:text-xs font-semibold hover:text-white transition-all active:scale-95"
                                >
                                    <Shield className="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1 sm:mr-1.5" /> Audit Logs
                                </Button>
                            </Link>
                        </div>
                    </div>
                </motion.div>

                {loadError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{loadError}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {statCards.map((stat, i) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + i * 0.08 }}
                        >
                            <HoverTooltip content={`${stat.label}: ${formatCompact(stat.value)}`} followCursor>
                                <div
                                    className="p-5 rounded-2xl bg-gradient-to-br from-zinc-900/65 to-zinc-950/70 border border-white/[0.06] hover:border-white/[0.14] transition-all cursor-default group"
                                    onMouseEnter={() => setHoveredStat(i)}
                                    onMouseLeave={() => setHoveredStat(null)}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div
                                            className="w-9 h-9 rounded-lg flex items-center justify-center"
                                            style={{ backgroundColor: `${stat.color}1a` }}
                                        >
                                            <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                                        </div>
                                        <ArrowUpRight className="w-3.5 h-3.5 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="text-2xl font-extrabold text-white tracking-tight">
                                        {isLoading ? <Skeleton className="h-7 w-16" /> : formatCompact(stat.value)}
                                    </div>
                                    <div className="text-[11px] text-zinc-500">{stat.label}</div>
                                    <MiniBarChart
                                        data={stat.sparkline.length > 0 ? stat.sparkline : [0, 0, 0, 0, 0, 0, 0]}
                                        color={stat.color}
                                        hovered={hoveredStat === i}
                                    />
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                                        <span className="text-[10px] text-zinc-600">{stat.change}</span>
                                    </div>
                                </div>
                            </HoverTooltip>
                        </motion.div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="lg:col-span-3 p-6 rounded-2xl bg-zinc-900/50 border border-white/[0.06]"
                    >
                        <InteractiveBarChart series={timeseries} />
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="lg:col-span-2 p-6 rounded-2xl bg-zinc-900/50 border border-white/[0.06]"
                    >
                        <DonutChart usersByRole={usersByRole} />
                    </motion.div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="space-y-3"
                >
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-sm font-bold text-white">Recent Activity</h2>
                        <Link
                            to="/dashboard/audit"
                            className="text-[11px] text-orange-400 hover:text-orange-300 font-semibold transition-colors"
                        >
                            View all -&gt;
                        </Link>
                    </div>
                    <div className="rounded-2xl bg-zinc-900/50 border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
                        {!isLoading && (auditRows.length > 0 ? auditRows.slice(0, 6) : []).map((item, i) => {
                            const type = classifyAuditType(item.action || '');
                            const userLabel =
                                item.user?.email ||
                                item.user?.full_name ||
                                item.user_id ||
                                'system';
                            return (
                                <div
                                    key={`${item.id}-${i}`}
                                    className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <Badge
                                            className={`text-[9px] font-semibold px-2 py-0.5 border ${typeStyles[type]}`}
                                        >
                                            {type}
                                        </Badge>
                                        <div>
                                            <div className="text-xs font-medium text-zinc-300">
                                                {(item.action || 'event').replace(/_/g, ' ')}
                                            </div>
                                            <div className="text-[10px] text-zinc-600">{userLabel}</div>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-zinc-600">
                                        {formatRelativeTime(item.timestamp || item.created_at)}
                                    </span>
                                </div>
                            );
                        })}
                        {isLoading && (
                            <div className="p-4 space-y-2.5">
                                {Array.from({ length: 4 }).map((_, idx) => (
                                    <div key={`admin-audit-skeleton-${idx}`} className="flex items-center justify-between px-1 py-2">
                                        <div className="flex items-center gap-3">
                                            <Skeleton className="h-4 w-14 rounded-full" />
                                            <div className="space-y-1.5">
                                                <Skeleton className="h-3.5 w-44" />
                                                <Skeleton className="h-3 w-28" />
                                            </div>
                                        </div>
                                        <Skeleton className="h-3 w-16" />
                                    </div>
                                ))}
                            </div>
                        )}
                        {!isLoading && auditRows.length === 0 && (
                            <div className="px-5 py-6 text-xs text-zinc-500">
                                No activity logs found yet.
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

        </>
    );
};

export default AdminDashboard;
