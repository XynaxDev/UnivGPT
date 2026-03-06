import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useChatStore, type ChatMessage } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import {
    ChevronDown, ChevronUp,
    FileText, Bot, Sparkles, Plus, ExternalLink,
    Brain, ArrowUp, GraduationCap, BookOpen, HelpCircle, MessageSquare, Search,
    Wallet, Building2, Calendar, MapPin, Copy, Check
} from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import type { SourceCitation } from '@/lib/api';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
    const profileImage = user?.profileImage || null;
    const userInitial = user?.full_name?.charAt(0) || 'U';

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

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
                            <BrandLogo className="w-6 h-6 text-black -ml-0.5" />
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className={cn("flex-1 min-w-0 flex flex-col", isUser ? "items-end text-right" : "items-start text-left")}>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={cn("text-xs font-semibold flex items-center gap-1", isUser ? "text-zinc-400" : "text-orange-400")}>
                            {isUser ? 'You' : (
                                <>
                                    <span className="text-zinc-200">Univ</span>
                                    <span className="text-orange-400">GPT</span>
                                </>
                            )}
                        </span>
                        {time && <span className="text-[10px] text-zinc-500 font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/5">{time}</span>}
                    </div>

                    <div className={cn(
                        "rounded-2xl px-4 sm:px-5 py-3 sm:py-4 text-sm leading-relaxed relative",
                        isUser
                            ? "bg-orange-500/10 border border-orange-500/15 text-white"
                            : "bg-white/[0.03] border border-white/[0.06] text-zinc-300"
                    )}>
                        {isUser ? (
                            <p className="whitespace-pre-wrap">{message.content}</p>
                        ) : (
                            <div className="prose prose-sm prose-zinc dark:prose-invert prose-p:leading-relaxed prose-a:text-orange-400 prose-headings:font-bold prose-headings:tracking-tight max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                            </div>
                        )}

                        {/* Copy Button */}
                        <div className={cn(
                            "absolute -bottom-7 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0",
                            isUser ? "right-1" : "left-1"
                        )}>
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-orange-400 transition-colors bg-zinc-900/50 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/5"
                                title="Copy message"
                            >
                                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                {copied ? "Copied" : "Copy"}
                            </button>
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
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { messages, isQuerying, sendQuery, newConversation } = useChatStore();
    const { token, user } = useAuthStore();

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
        }
    }, [input]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !token || isQuerying) return;
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

    const suggestions = [
        { icon: Wallet, text: "What is the fee payment deadline for this semester?", desc: "Fees & Dues" },
        { icon: Calendar, text: "Show me the official university holiday list", desc: "Campus Schedule" },
        { icon: MapPin, text: "How do I apply for a campus bus pass?", desc: "Transportation" },
        { icon: Building2, text: "What are the rules and timings for the boys' hostel?", desc: "Campus Life" },
    ];

    const firstName = user?.full_name?.split(' ')[0] || 'there';

    return (
        <div className="flex flex-col h-[calc(100vh-80px)]">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent="true" style={{ WebkitOverflowScrolling: 'touch' }}>
                {messages.length === 0 ? (
                    /* ───── Premium Empty State ───── */
                    <div className="flex flex-col items-center min-h-full px-4 sm:px-6 py-8 text-center">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6 sm:space-y-10 max-w-2xl w-full my-auto">
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
                                    Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">{firstName}</span>
                                </h2>
                                <p className="text-zinc-500 text-sm leading-relaxed max-w-md mx-auto">
                                    Ask me anything about your university — courses, policies, research, deadlines, and more.
                                </p>
                            </div>

                            {/* Suggestion Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mx-auto">
                                {suggestions.map((s, i) => (
                                    <motion.button
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 + i * 0.08 }}
                                        onClick={() => setInput(s.text)}
                                        className="flex items-start gap-3 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-orange-500/[0.04] hover:border-orange-500/20 transition-all text-left group"
                                    >
                                        <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center shrink-0 group-hover:bg-orange-500/15 transition-colors">
                                            <s.icon className="w-4 h-4 text-orange-400/80 group-hover:text-orange-400 transition-colors" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider mb-0.5">{s.desc}</p>
                                            <p className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors leading-relaxed">{s.text}</p>
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                ) : (
                    /* ───── Messages ───── */
                    <div className="px-6 py-4">
                        {messages.map((msg, i) => (
                            <MessageBubble key={i} message={msg} />
                        ))}
                        {isQuerying && (
                            <motion.div className="max-w-3xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <div className="flex gap-4 py-5">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
                                        <BrandLogo className="w-6 h-6 text-black -ml-0.5" />
                                    </div>
                                    <div className="flex-1">
                                        <span className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1">
                                            <span className="text-zinc-200">Univ</span>
                                            <span className="text-orange-400">GPT</span>
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

            {/* ───── Input Bar — Premium ───── */}
            <div className="px-2 sm:px-6 pb-2 sm:pb-6 pt-0 shrink-0 bg-transparent">
                <form onSubmit={handleSend} className="max-w-3xl mx-auto">
                    <div className="relative flex items-end bg-white/[0.04] border border-white/[0.08] rounded-2xl focus-within:border-orange-500/30 focus-within:bg-white/[0.05] transition-all shadow-xl shadow-black/10">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask about courses, policies, research..."
                            className="flex-1 bg-transparent px-4 py-3 sm:px-5 sm:py-4 text-xs sm:text-sm placeholder:text-zinc-600 outline-none resize-none max-h-40 min-h-[44px] sm:min-h-[52px] text-white"
                            rows={1}
                            disabled={isQuerying}
                        />
                        <div className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 shrink-0">
                            {messages.length > 0 && (
                                <button
                                    type="button"
                                    onClick={newConversation}
                                    className="h-8 w-8 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all"
                                    title="New chat"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            )}
                            <Button
                                type="submit"
                                size="icon"
                                className="h-9 w-9 rounded-xl bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-500/20 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-90 disabled:opacity-30 disabled:hover:scale-100 disabled:shadow-none"
                                disabled={!input.trim() || isQuerying}
                            >
                                <ArrowUp className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                    <p className="text-[10px] text-zinc-700 text-center mt-2.5">
                        <span className="text-zinc-300">Univ</span>
                        <span className="text-orange-400">GPT</span>
                        {' '}can make mistakes. Verify important information with official sources.
                    </p>
                </form>
            </div>
        </div>
    );
}
