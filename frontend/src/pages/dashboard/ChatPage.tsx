/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useChatStore, type ChatMessage } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import {
    ChevronDown, ChevronUp,
    FileText, Bot, Sparkles, Plus, ExternalLink,
    ArrowUp,
    Copy, Check, AlertTriangle
} from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { agentApi, type ModerationMeta, type SourceCitation } from '@/lib/api';
import { cn } from '@/lib/utils';
import { HoverTooltip } from '@/components/ui/tooltip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useLocation, useNavigate } from 'react-router-dom';

type ChatRole = 'student' | 'faculty' | 'admin';

const normalizeGreetingName = (fullName?: string | null, role?: ChatRole) => {
    const raw = String(fullName || '').trim();
    if (!raw) return role === 'faculty' ? 'Faculty' : 'there';
    if (role === 'faculty') return raw;
    return raw.split(/\s+/).filter(Boolean)[0] || 'there';
};

const CHAT_ROLE_UI: Record<ChatRole, {
    assistantTitle: string;
    emptySubtitle: string;
    inputPlaceholder: string;
    quickPrompts: string[];
}> = {
    student: {
        assistantTitle: 'Student Assistant',
        emptySubtitle: 'Ask about notices, courses, deadlines, and campus policy updates in your scope.',
        inputPlaceholder: 'Ask about courses, notices, and deadlines...',
        quickPrompts: [
            'Show my latest course notices.',
            'Any deadlines this week for my scope?',
            'List faculty mapped to my courses.',
        ],
    },
    faculty: {
        assistantTitle: 'Faculty Assistant',
        emptySubtitle: 'Use this for class notices, department circulars, and faculty-course operational updates.',
        inputPlaceholder: 'Ask about circulars, classes, and department updates...',
        quickPrompts: [
            'Summarize latest faculty circulars.',
            'Show recent class-related uploads.',
            'List course-faculty mappings for my department.',
        ],
    },
    admin: {
        assistantTitle: 'Admin Assistant',
        emptySubtitle: 'Use this for admin operations: user metrics, audit trends, document pipeline, and moderation.',
        inputPlaceholder: 'Ask admin ops: users, audit, docs, moderation...',
        quickPrompts: [
            'How many students, faculty, and admins are active?',
            'Show recent uploads and uploader details.',
            'Summarize latest audit activity.',
        ],
    },
};

type NavigateTarget =
    | string
    | {
        path: string;
        state?: Record<string, unknown>;
    };

function ThinkingText({ seconds }: { seconds: number }) {
    return (
        <div className="flex items-center gap-2 text-sm leading-relaxed">
            <motion.span
                className="relative font-normal text-zinc-500"
                animate={{
                    textShadow: [
                        '0 0 0 rgba(255,255,255,0)',
                        '0 0 10px rgba(255,255,255,0.14)',
                        '0 0 0 rgba(255,255,255,0)',
                    ],
                    opacity: [0.82, 0.98, 0.82],
                }}
                transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
            >
                <span className="relative z-10">Thinking...</span>
                <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.04)_38%,rgba(255,255,255,0.65)_50%,rgba(255,255,255,0.04)_62%,transparent_100%)] bg-[length:220%_100%] bg-clip-text text-transparent"
                    animate={{ backgroundPosition: ['130% 0%', '-40% 0%'] }}
                    transition={{ duration: 1.85, repeat: Infinity, ease: 'linear' }}
                >
                    Thinking...
                </motion.span>
            </motion.span>
            <span className="text-sm font-normal text-zinc-500">{seconds}s</span>
        </div>
    );
}

function resolveCitationTarget(source: SourceCitation, role: ChatRole): NavigateTarget {
    const navigationTarget = String(source.metadata?.navigation_target || '').trim().toLowerCase();
    if (navigationTarget === 'timetable') {
        return '/dashboard/timetable';
    }
    if (navigationTarget === 'notifications') {
        return {
            path: '/dashboard/notifications',
            state: { focusNotificationId: source.document_id, openDocumentId: source.document_id },
        };
    }
    if (navigationTarget === 'notices') {
        return {
            path: '/dashboard/notices',
            state: { focusNoticeDocumentId: source.document_id, openNoticeDocumentId: source.document_id },
        };
    }
    if (navigationTarget === 'courses') {
        return '/dashboard/courses';
    }
    if (role === 'student') {
        return '/dashboard/courses';
    }
    return {
        path: '/dashboard/documents',
        state: { focusDocumentId: source.document_id, openDocumentId: source.document_id },
    };
}

function SourceCard({ source, role, navigateTo }: { source: SourceCitation; role: ChatRole; navigateTo: (target: NavigateTarget) => void }) {
    const [expanded, setExpanded] = useState(false);
    const target = resolveCitationTarget(source, role);
    return (
        <div
            className="border border-white/[0.06] rounded-xl p-3 text-xs bg-white/[0.02] hover:border-orange-500/20 transition-all group cursor-pointer"
            onClick={() => setExpanded(!expanded)}
        >
            <div className="flex items-center gap-3 w-full text-left">
                <div className="w-7 h-7 flex items-center justify-center bg-orange-500/10 rounded-lg shrink-0">
                    <FileText className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <span className="truncate flex-1 text-zinc-400 font-medium group-hover:text-white transition-colors">{source.title}</span>
                {expanded ? <ChevronUp className="w-3 h-3 text-zinc-600" /> : <ChevronDown className="w-3 h-3 text-zinc-600" />}
            </div>
            <AnimatePresence>
                {expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="mt-3 pt-3 border-t border-white/[0.06]">
                            <p className="text-zinc-500 leading-relaxed italic text-[11px]">"{source.snippet}"</p>
                            <div className="mt-3 flex items-center gap-2">
                                <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded-lg text-zinc-600 border border-white/5">
                                    REF: {source.document_id.slice(0, 8)}
                                </span>
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        navigateTo(target);
                                    }}
                                    className="ml-auto text-[10px] flex items-center gap-1 text-orange-400 hover:text-orange-300 transition-colors"
                                >
                                    View Source <ExternalLink className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function MessageBubble({ message, navigateTo, role }: { message: ChatMessage; navigateTo: (target: NavigateTarget) => void; role: ChatRole }) {
    const isUser = message.role === 'user';
    const { user } = useAuthStore();
    const [copied, setCopied] = useState(false);
    const [showReasoning, setShowReasoning] = useState(false);
    const profileImage = (user as any)?.profileImage || null;
    const userInitial = user?.full_name?.charAt(0) || 'U';
    const isSafetyMessage =
        !isUser &&
        (
            /^(warning\s*\d+\/\d+|safety alert)\s*:/i.test(message.content.trim()) ||
            String(message.roleBadge || '').toLowerCase().includes('safety')
        );

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const time = message.timestamp
        ? new Date(message.timestamp)
            .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
            .replace(/\s?(am|pm)$/i, (match) => ` ${match.trim().toUpperCase()}`)
        : '';
    const fallbackAssistantLabel =
        user?.role === 'admin'
            ? 'Admin Assistant'
            : user?.role === 'faculty'
                ? 'Faculty Assistant'
                : 'Student Assistant';

    return (
        <motion.div
            className="max-w-3xl mx-auto w-full group"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className={cn("flex gap-3 sm:gap-4 py-4 sm:py-5", isUser ? "flex-row-reverse" : "")}>
                {/* Avatar */}
                <div className="shrink-0 pt-1">
                    {isUser ? (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center overflow-hidden">
                            {profileImage ? (
                                <img src={profileImage} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-[11px] font-bold text-white uppercase">{userInitial}</span>
                            )}
                        </div>
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                            <BrandLogo className="w-6 h-6 text-black" />
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className={cn("flex-1 min-w-0 flex flex-col", isUser ? "items-end text-right" : "items-start text-left")}>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={cn("text-xs font-semibold", isUser ? "text-zinc-400" : "text-orange-400")}>
                            {isUser ? 'You' : (
                                message.roleBadge || fallbackAssistantLabel
                            )}
                        </span>
                        {time && (
                            <>
                                <span className="text-zinc-600 text-[10px]">|</span>
                                <span className="text-[10px] text-zinc-500 font-medium">{time}</span>
                            </>
                        )}
                    </div>

                    <div className={cn(
                        "text-sm leading-relaxed relative",
                        isUser
                            ? "rounded-2xl px-4 sm:px-5 py-3 sm:py-4 bg-white/[0.03] text-zinc-100"
                            : isSafetyMessage
                                ? "rounded-2xl px-4 sm:px-5 py-3 sm:py-4 bg-gradient-to-br from-red-500/14 via-amber-500/10 to-red-500/14 border border-red-400/45 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.12),0_10px_35px_rgba(239,68,68,0.18)]"
                            : "px-0 py-0 text-zinc-100 sm:text-zinc-300"
                    )}>
                        {!isUser && isSafetyMessage && (
                            <div className="mb-3 overflow-hidden rounded-2xl border border-red-400/30 bg-[linear-gradient(135deg,rgba(127,29,29,0.35),rgba(120,53,15,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                                <div className="flex items-center gap-2 border-b border-red-400/20 px-3 py-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/20 text-red-100">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-100">
                                            Safety Intervention
                                        </div>
                                        <div className="text-[11px] text-red-100/75">
                                            This message was moderated before a normal answer was returned.
                                        </div>
                                    </div>
                                </div>
                                {message.moderation?.reason && (
                                    <div className="px-3 py-2 text-xs text-red-50/80">
                                        <span className="font-semibold text-red-100">Reason:</span> {message.moderation.reason}
                                    </div>
                                )}
                            </div>
                        )}
                        {isUser ? (
                            <p className="whitespace-pre-wrap">{message.content}</p>
                        ) : (
                            <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-headings:tracking-tight prose-strong:text-white prose-a:text-orange-400 text-zinc-100 sm:text-zinc-300">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        a: ({ href = '', children, ...props }) => {
                                            const isInternal = href.startsWith('/');
                                            if (isInternal) {
                                                return (
                                                    <Link
                                                        to={href}
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            navigateTo(href);
                                                        }}
                                                        className="text-orange-300 hover:text-orange-200 underline underline-offset-2"
                                                        {...props}
                                                    >
                                                        {children}
                                                    </Link>
                                                );
                                            }
                                            return (
                                                <a
                                                    href={href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-orange-300 hover:text-orange-200 underline underline-offset-2"
                                                    {...props}
                                                >
                                                    {children}
                                                </a>
                                            );
                                        },
                                    }}
                                >
                                    {message.content}
                                </ReactMarkdown>
                                {message.isStreaming && (
                                    <span className="inline-block ml-1 h-[1em] align-[-0.15em] w-[2px] bg-orange-300 animate-pulse" />
                                )}
                            </div>
                        )}

                        {!isUser && message.rationale && (
                            <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <button
                                    type="button"
                                    onClick={() => setShowReasoning((prev) => !prev)}
                                    className="w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.025]"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-200">
                                                <Sparkles className="h-3 w-3" />
                                                Model Reasoning
                                            </div>
                                            <p className="mt-2 text-xs leading-5 text-zinc-400">
                                                Internal reasoning captured separately from the final answer.
                                            </p>
                                        </div>
                                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-zinc-300">
                                            {showReasoning ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                        </div>
                                    </div>
                                </button>
                                <AnimatePresence initial={false}>
                                    {showReasoning && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="border-t border-white/[0.06] bg-black/20 px-4 py-4">
                                                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs leading-6 text-zinc-300 whitespace-pre-wrap">
                                                    {message.rationale}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                    </div>

                    <div
                        className={cn(
                            "mt-3 flex min-h-6 items-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100",
                            isUser ? "justify-end self-end" : "justify-start self-start",
                        )}
                    >
                        <HoverTooltip content="Copy message" side={isUser ? "left" : "right"}>
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-orange-400 transition-colors px-1 py-1 rounded-lg"
                            >
                                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                {copied ? "Copied" : "Copy"}
                            </button>
                        </HoverTooltip>
                    </div>

                    {!isUser && message.sources && message.sources.length > 0 && (
                        <div className="mt-6 flex flex-col gap-3 w-full">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-zinc-500 pl-1">
                                <Plus className="w-3 h-3 text-orange-400" /> Reference Citations
                            </div>
                            {message.sources.map((src, i) => (
                                <SourceCard key={i} source={src} role={role} navigateTo={navigateTo} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

export default function ChatPage() {
    const [input, setInput] = useState('');
    const [appealMessage, setAppealMessage] = useState('');
    const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
    const [appealFeedback, setAppealFeedback] = useState<string | null>(null);
    const [moderationState, setModerationState] = useState<ModerationMeta | null>(null);
    const [isLoadingModerationState, setIsLoadingModerationState] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { messages, isQuerying, sendQuery, newConversation, error, clearError, setScope } = useChatStore();
    const { token, user } = useAuthStore();
    const location = useLocation();
    const navigate = useNavigate();
    const [queryStartedAt, setQueryStartedAt] = useState<number | null>(null);
    const [queryElapsedSeconds, setQueryElapsedSeconds] = useState(0);
    const previousMessageCountRef = useRef(messages.length);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!isQuerying) {
            setQueryStartedAt(null);
            setQueryElapsedSeconds(0);
            return;
        }
        const started = Date.now();
        setQueryStartedAt(started);
        setQueryElapsedSeconds(0);
        const interval = window.setInterval(() => {
            setQueryElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
        }, 250);
        return () => window.clearInterval(interval);
    }, [isQuerying]);

    const role = ((user?.role || 'student') as ChatRole);

    useEffect(() => {
        if (!token || role !== 'student') {
            setIsLoadingModerationState(false);
            setModerationState(null);
            return;
        }
        let cancelled = false;
        setIsLoadingModerationState(true);
        agentApi.getModerationState(token)
            .then((res) => {
                if (!cancelled) {
                    setModerationState(res.moderation || null);
                }
            })
            .catch(() => undefined)
            .finally(() => {
                if (!cancelled) {
                    setIsLoadingModerationState(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [token, role]);

    useEffect(() => {
        const previousCount = previousMessageCountRef.current;
        previousMessageCountRef.current = messages.length;
        if (messages.length <= previousCount) return;

        const latest = [...messages]
            .slice(previousCount)
            .reverse()
            .find((m) => m.role === 'assistant' && m.moderation)?.moderation as ModerationMeta | undefined;
        if (latest) {
            setModerationState(latest);
        }
    }, [messages]);

    useEffect(() => {
        const prefill = (location.state as { prefill?: string } | null)?.prefill;
        if (!prefill) return;
        setInput(prefill);
        requestAnimationFrame(() => textareaRef.current?.focus());
        navigate(location.pathname, { replace: true, state: null });
    }, [location.key, location.pathname, location.state, navigate]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
        }
    }, [input]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !token || isQuerying || moderationState?.blocked || isLoadingModerationState) return;
        if (role === 'student') {
            try {
                const res = await agentApi.getModerationState(token);
                if (res?.moderation) {
                    setModerationState(res.moderation);
                    if (res.moderation.blocked) return;
                }
            } catch {
                // Backend still enforces blocked state if this refresh fails.
            }
        }
        const query = input;
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        await sendQuery(token, query);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend(e);
        }
    };

    const greetingName = normalizeGreetingName(user?.full_name, role);
    const chatScope = `dashboard-chat:${user?.id || 'anon'}:${role}`;
    const roleUI = CHAT_ROLE_UI[role] || CHAT_ROLE_UI.student;
    const isChatBlocked = Boolean(moderationState?.blocked);
    const appealPending = String(moderationState?.appeal_status || '').toLowerCase() === 'pending';
    const hasStreamingAssistant = messages.some((m) => m.role === 'assistant' && m.isStreaming);
    const thinkingHint =
        queryElapsedSeconds >= 8
            ? 'Still working through live scope data and references.'
            : queryElapsedSeconds >= 3
                ? 'Checking your role-bound context and the latest records.'
                : 'Preparing a grounded reply from your UnivGPT workspace.';

    const handleSubmitAppeal = async () => {
        if (!token || !appealMessage.trim() || isSubmittingAppeal || !isChatBlocked) return;
        try {
            setIsSubmittingAppeal(true);
            setAppealFeedback(null);
            const res = await agentApi.submitAppeal(token, appealMessage.trim());
            setAppealFeedback(res.message || 'Appeal submitted.');
            setAppealMessage('');
            if (res.moderation) setModerationState(res.moderation);
        } catch (err) {
            setAppealFeedback((err as Error)?.message || 'Failed to submit appeal.');
        } finally {
            setIsSubmittingAppeal(false);
        }
    };

    useEffect(() => {
        setScope(chatScope);
    }, [chatScope, setScope]);

    const handleNavigate = (target: NavigateTarget) => {
        if (typeof target === 'string') {
            navigate(target);
            return;
        }
        navigate(target.path, { state: target.state });
    };

    return (
        <div className="flex h-[calc(100dvh-5rem)] min-h-[calc(100dvh-5rem)] flex-1 flex-col md:h-full md:min-h-0">
            {/* Messages Area */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent="true" style={{ WebkitOverflowScrolling: 'touch' }}>
                {messages.length === 0 ? (
                    /* â”€â”€â”€â”€â”€ Premium Empty State â”€â”€â”€â”€â”€ */
                    <div className="flex flex-col items-center min-h-full px-4 sm:px-6 py-10 sm:py-14 text-center">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6 sm:space-y-8 max-w-2xl w-full">
                            {/* Brand Icon */}
                            <div className="relative mx-auto w-12 h-12 sm:w-16 sm:h-16">
                                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/20 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-orange-400" />
                                </div>
                                <div className="absolute -inset-6 bg-orange-500/8 blur-3xl rounded-full -z-10" />
                            </div>

                            {/* Greeting */}
                            <div>
                                <h2 className="text-3xl font-extrabold tracking-tight mb-3">
                                    Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">{greetingName}</span>
                                </h2>
                                <p className="text-zinc-500 text-sm leading-relaxed max-w-md mx-auto">
                                    {roleUI.emptySubtitle}
                                </p>
                                <div className="mt-3 inline-flex items-center rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-300">
                                    {roleUI.assistantTitle}
                                </div>
                                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                                    {roleUI.quickPrompts.map((prompt) => (
                                        <button
                                            key={prompt}
                                            type="button"
                                            onClick={() => setInput(prompt)}
                                            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-300 hover:text-white hover:border-orange-500/35 hover:bg-orange-500/10 transition-colors"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                        </motion.div>
                    </div>
                ) : (
                    /* â”€â”€â”€â”€â”€ Messages â”€â”€â”€â”€â”€ */
                    <div className="px-4 py-4 sm:px-6">
                        {messages.map((msg, i) => (
                            <MessageBubble key={i} message={msg} navigateTo={handleNavigate} role={role} />
                        ))}
                        {isQuerying && !hasStreamingAssistant && (
                            <motion.div className="max-w-3xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <div className="flex gap-4 py-5">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
                                        <BrandLogo className="w-6 h-6 text-black" />
                                    </div>
                                    <div className="flex-1">
                                        <span className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1">
                                            UnivGPT
                                        </span>
                                        <div className="py-3">
                                            <div className="min-w-0">
                                                <ThinkingText seconds={queryStartedAt ? queryElapsedSeconds : 0} />
                                                <div className="mt-1 text-[11px] text-zinc-500 sm:text-zinc-600">
                                                    {thinkingHint}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* â”€â”€â”€â”€â”€ Input Bar â€” Premium â”€â”€â”€â”€â”€ */}
            <div className="sticky bottom-0 shrink-0 bg-[#06070a]/95 px-2 pb-2 pt-0 backdrop-blur-sm sm:px-6 sm:pb-6">
                <form onSubmit={handleSend} className="max-w-3xl mx-auto">
                    {isChatBlocked && (
                        <div className="mb-3 rounded-2xl border border-red-500/35 bg-red-950/30 p-3 sm:p-4">
                            <div className="text-xs font-semibold text-red-200 mb-1">Chat access blocked</div>
                            <p className="text-[11px] sm:text-xs text-red-100/90 leading-relaxed">
                                You have reached the maximum violation limit. Submit an apology appeal below. The Dean section can review and restore your access.
                            </p>
                            {!appealPending && (
                                <div className="mt-3 flex flex-col gap-2">
                                    <textarea
                                        value={appealMessage}
                                        onChange={(e) => setAppealMessage(e.target.value)}
                                        placeholder="Write your apology and commitment to follow chat policy..."
                                        className="w-full min-h-[84px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-orange-500/40"
                                    />
                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            onClick={handleSubmitAppeal}
                                            disabled={isSubmittingAppeal || !appealMessage.trim()}
                                            className="h-8 px-4 rounded-lg bg-orange-600 hover:bg-orange-500 text-xs font-semibold"
                                        >
                                            {isSubmittingAppeal ? 'Submitting...' : 'Submit Apology Appeal'}
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {appealFeedback && (
                                <div className="mt-2 text-[11px] text-zinc-200">{appealFeedback}</div>
                            )}
                        </div>
                    )}
                    {error && (
                        <div className="mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200 flex items-center justify-between gap-3">
                            <span>{error}</span>
                            <button
                                type="button"
                                onClick={clearError}
                                className="text-red-300 hover:text-red-100 transition-colors text-[10px] font-semibold"
                            >
                                Dismiss
                            </button>
                        </div>
                    )}
                    <div className="relative flex items-end bg-white/[0.04] border border-white/[0.08] rounded-2xl focus-within:border-orange-500/30 focus-within:bg-white/[0.05] transition-all shadow-xl shadow-black/10">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onWheelCapture={(e) => e.stopPropagation()}
                            placeholder={roleUI.inputPlaceholder}
                            data-lenis-prevent="true"
                            className="flex-1 bg-transparent px-4 py-3 sm:px-5 sm:py-4 text-xs sm:text-sm placeholder:text-zinc-600 outline-none resize-none max-h-40 min-h-[44px] sm:min-h-[52px] text-white overflow-y-auto overscroll-contain"
                            rows={1}
                            disabled={isQuerying || isChatBlocked || isLoadingModerationState}
                        />
                        <div className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 shrink-0">
                            {messages.length > 0 && (
                                <HoverTooltip content="New chat">
                                    <button
                                        type="button"
                                        onClick={newConversation}
                                        className="h-8 w-8 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </HoverTooltip>
                            )}
                            <Button
                                type="submit"
                                size="icon"
                                className="h-9 w-9 rounded-xl bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-500/20 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-90 disabled:opacity-30 disabled:hover:scale-100 disabled:shadow-none"
                                disabled={!input.trim() || isQuerying || isChatBlocked || isLoadingModerationState}
                            >
                                <ArrowUp className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                    <p className="text-[10px] text-zinc-700 text-center mt-2.5">
                        <span className="text-zinc-300">UnivGPT</span> can make mistakes. Verify important information with official sources.
                    </p>
                </form>
            </div>
        </div>
    );
}



