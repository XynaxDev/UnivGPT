/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import React, { useState, useRef, useEffect } from 'react';
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

function SourceCard({ source }: { source: SourceCitation }) {
    const [expanded, setExpanded] = useState(false);
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
                                <a href={`/dashboard/documents?id=${source.document_id}`} className="ml-auto text-[10px] flex items-center gap-1 text-orange-400 hover:text-orange-300 transition-colors">
                                    View Source <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function MessageBubble({ message }: { message: ChatMessage }) {
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

    const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
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
                        <span className={cn("text-xs font-semibold flex items-center gap-1", isUser ? "text-zinc-400" : "text-orange-400")}>
                            {isUser ? 'You' : (
                                message.roleBadge || fallbackAssistantLabel
                            )}
                        </span>
                        {time && <span className="text-[10px] text-zinc-500 font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/5">{time}</span>}
                    </div>

                    <div className={cn(
                        "rounded-2xl px-4 sm:px-5 py-3 sm:py-4 text-sm leading-relaxed relative",
                        isUser
                            ? "bg-white/[0.03] border border-white/[0.08] text-zinc-100"
                            : isSafetyMessage
                                ? "bg-gradient-to-br from-red-500/14 via-amber-500/10 to-red-500/14 border border-red-400/45 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.12),0_10px_35px_rgba(239,68,68,0.18)]"
                            : "bg-white/[0.03] border border-white/[0.06] text-zinc-300"
                    )}>
                        {!isUser && isSafetyMessage && (
                            <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-100">
                                <AlertTriangle className="w-3 h-3" />
                                Safety Warning
                            </div>
                        )}
                        {isUser ? (
                            <p className="whitespace-pre-wrap">{message.content}</p>
                        ) : (
                            <div className="prose prose-sm prose-zinc dark:prose-invert prose-p:leading-relaxed prose-a:text-orange-400 prose-headings:font-bold prose-headings:tracking-tight max-w-none">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        a: ({ href = '', children, ...props }) => {
                                            const isInternal = href.startsWith('/');
                                            if (isInternal) {
                                                return (
                                                    <Link to={href} className="text-orange-300 hover:text-orange-200 underline underline-offset-2" {...props}>
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
                            <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setShowReasoning((prev) => !prev)}
                                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400 hover:text-zinc-200 transition-colors"
                                >
                                    <span>Model Reasoning</span>
                                    {showReasoning ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                                <AnimatePresence initial={false}>
                                    {showReasoning && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="border-t border-white/[0.06] px-3 py-3 text-xs leading-6 text-zinc-400 whitespace-pre-wrap">
                                                {message.rationale}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Copy Button */}
                        <div className={cn(
                            "absolute -bottom-7 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0",
                            isUser ? "right-1" : "left-1"
                        )}>
                            <HoverTooltip content="Copy message" side={isUser ? "left" : "right"}>
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-orange-400 transition-colors bg-zinc-900/50 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/5"
                                >
                                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                    {copied ? "Copied" : "Copy"}
                                </button>
                            </HoverTooltip>
                        </div>
                    </div>

                    {!isUser && message.sources && message.sources.length > 0 && (
                        <div className="mt-6 flex flex-col gap-3 w-full">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-zinc-500 pl-1">
                                <Plus className="w-3 h-3 text-orange-400" /> Reference Citations
                            </div>
                            {message.sources.map((src, i) => (
                                <SourceCard key={i} source={src} />
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
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { messages, isQuerying, sendQuery, newConversation, error, clearError, setScope } = useChatStore();
    const { token, user } = useAuthStore();
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        agentApi.getModerationState(token)
            .then((res) => {
                if (!cancelled) {
                    setModerationState(res.moderation || null);
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [token]);

    useEffect(() => {
        const latest = [...messages]
            .reverse()
            .find((m) => m.role === 'assistant' && m.moderation)?.moderation as ModerationMeta | undefined;
        if (latest) setModerationState(latest);
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
        if (!input.trim() || !token || isQuerying || moderationState?.blocked) return;
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

    const role = ((user?.role || 'student') as ChatRole);
    const greetingName = normalizeGreetingName(user?.full_name, role);
    const chatScope = `dashboard-chat:${user?.id || 'anon'}:${role}`;
    const roleUI = CHAT_ROLE_UI[role] || CHAT_ROLE_UI.student;
    const isChatBlocked = Boolean(moderationState?.blocked);
    const appealPending = String(moderationState?.appeal_status || '').toLowerCase() === 'pending';
    const hasStreamingAssistant = messages.some((m) => m.role === 'assistant' && m.isStreaming);

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

    return (
        <div className="flex flex-col h-[calc(100vh-80px)]">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent="true" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                    <div className="px-6 py-4">
                        {messages.map((msg, i) => (
                            <MessageBubble key={i} message={msg} />
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
                                        <div className="flex items-center gap-3 py-3">
                                            <div className="flex gap-1">
                                                <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                            <span className="text-xs text-zinc-600">Thinking...</span>
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
            <div className="px-2 sm:px-6 pb-2 sm:pb-6 pt-0 shrink-0 bg-transparent">
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
                            {appealPending && (
                                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                                    Appeal already submitted and pending dean review.
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
                            disabled={isQuerying || isChatBlocked}
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
                                disabled={!input.trim() || isQuerying || isChatBlocked}
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



