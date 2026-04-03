import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useChatStore, type ChatMessage } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import {
    Send, Loader2, MessageSquare, ChevronDown, ChevronUp,
    FileText, Bot, User, Sparkles, Plus, Terminal, RefreshCcw, Search, ExternalLink, Shield,
    Brain, Cpu, Zap
} from 'lucide-react';
import type { SourceCitation } from '@/lib/api';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function SourceCard({ source }: { source: SourceCitation }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="border border-white/5 rounded-2xl p-4 text-[10px] bg-white/[0.02] backdrop-blur-md hover:border-white/20 transition-all group">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-3 w-full text-left font-black uppercase tracking-widest"
            >
                <div className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-xl group-hover:bg-white group-hover:text-black transition-all">
                    <FileText className="w-4 h-4 shrink-0" />
                </div>
                <span className="truncate flex-1 text-[11px] text-zinc-400 group-hover:text-white transition-colors">{source.title}</span>
                <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center transition-transform group-hover:scale-110">
                    {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
            </button>
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-4 pt-4 border-t border-dashed border-white/10">
                            <p className="text-zinc-500 leading-relaxed font-semibold italic text-[11px]">"{source.snippet}"</p>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <span className="text-[9px] bg-white/5 px-2 py-1 rounded-lg uppercase font-black text-zinc-600 border border-white/5">
                                    REF: {source.document_id.slice(0, 8)}
                                </span>

                                {source.metadata && Object.entries(source.metadata).map(([key, value]) => {
                                    if (key === 'department' || key === 'course' || !value) return null;
                                    return (
                                        <span key={key} className="text-[9px] px-2 py-1 rounded-lg uppercase font-black border bg-white/5 text-zinc-500 border-white/5">
                                            {key.replace('_', ' ')}: {String(value)}
                                        </span>
                                    );
                                })}
                                <a
                                    href={`/dashboard/documents?id=${source.document_id}`}
                                    className="ml-auto text-[9px] flex items-center gap-1.5 font-black text-white hover:text-zinc-400 transition-colors uppercase tracking-widest"
                                >
                                    Access Original <ExternalLink className="w-3 h-3" />
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

    return (
        <motion.div
            className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-12`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "circOut" }}
        >
            <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'} space-y-4`}>
                {!isUser && (
                    <div className="flex items-center gap-3 mb-2 px-1">
                        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                            <Bot className="w-5 h-5 text-black" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Neural Agent</span>
                            <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-[0.3em]">Synaptic Pipeline</span>
                        </div>
                    </div>
                )}

                <div
                    className={cn(
                        "rounded-[2.5rem] px-8 py-7 text-[15px] leading-relaxed relative",
                        isUser
                            ? "bg-white text-black font-bold shadow-[0_0_50px_rgba(255,255,255,0.05)] rounded-tr-none"
                            : "glass border-white/5 shadow-2xl rounded-tl-none"
                    )}
                >
                    {isUser ? (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                        <div className="prose prose-zinc dark:prose-invert prose-p:leading-relaxed prose-a:text-white 
                            prose-headings:font-black prose-headings:tracking-tighter prose-headings:uppercase
                            prose-tr:border-b prose-tr:border-white/5 prose-th:bg-white/5 prose-th:uppercase prose-th:text-[10px] prose-th:tracking-[0.2em] prose-th:py-3 prose-th:px-4 prose-td:px-4">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                            </ReactMarkdown>
                            {message.isStreaming && (
                                <span className="inline-block ml-1 h-[1em] align-[-0.15em] w-[2px] bg-white/80 animate-pulse" />
                            )}
                        </div>
                    )}
                </div>

                {/* Source citations */}
                {!isUser && message.sources && message.sources.length > 0 && (
                    <div className="mt-8 space-y-4">
                        <div className="flex items-center gap-4 px-2">
                            <div className="h-[1px] w-8 bg-white/10" />
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 flex items-center gap-2">
                                <Search className="w-3.5 h-3.5" /> Intelligence Corpus ({message.sources.length} nodes)
                            </p>
                            <div className="h-[1px] flex-1 bg-white/10" />
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {message.sources.map((source, i) => (
                                <SourceCard key={i} source={source} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

interface ChatWidgetProps {
    className?: string;
    fullHeight?: boolean;
    scopeKey?: string;
}

export default function ChatWidget({ className = '', fullHeight = false, scopeKey = 'chat-widget' }: ChatWidgetProps) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { messages, isQuerying, sendQuery, newConversation, setScope } = useChatStore();
    const { token, user } = useAuthStore();
    const hasStreamingAssistant = messages.some((m) => m.role === 'assistant' && m.isStreaming);

    useEffect(() => {
        setScope(`${scopeKey}:${user?.id || 'anon'}`);
    }, [scopeKey, setScope, user?.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !token || isQuerying) return;
        const query = input;
        setInput('');
        await sendQuery(token, query);
    };

    return (
        <div className={cn(
            "flex flex-col bg-zinc-950/20 backdrop-blur-3xl overflow-hidden transition-all relative border border-white/5",
            fullHeight ? 'h-full rounded-none border-x-0 border-t-0' : 'h-[850px] rounded-[4rem] shadow-[0_0_100px_rgba(0,0,0,0.5)]',
            className
        )}>
            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-white/5 rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-zinc-500/5 rounded-full blur-[100px] pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between px-10 py-8 border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0 z-20">
                <div className="flex items-center gap-6">
                    <div className="relative">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                            <Brain className="w-7 h-7 text-white" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white border-4 border-black animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3">
                            Neural Interaction <span className="text-[10px] text-zinc-600 font-black lowercase italic opacity-40 px-3 py-1 rounded-full border border-white/5">v4.0.2</span>
                        </h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 mt-0.5">Vector Tunnel Synchronized</p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    className="h-12 rounded-full px-8 border-white/10 hover:bg-white/5 text-[10px] font-black uppercase tracking-widest gap-3 transition-all"
                    onClick={newConversation}
                >
                    <RefreshCcw className="w-3.5 h-3.5" />
                    Flush Context
                </Button>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-10 scrollbar-none custom-scrollbar relative z-10">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center max-w-2xl mx-auto space-y-16">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-28 h-28 bg-white/5 border border-white/10 flex items-center justify-center rounded-[3rem] relative group"
                        >
                            <Bot className="w-12 h-12 text-white group-hover:scale-110 transition-transform" />
                            <div className="absolute -inset-6 bg-white/5 rounded-[4rem] blur-3xl -z-10 opacity-30" />
                        </motion.div>

                        <div className="space-y-6">
                            <h3 className="text-6xl font-black tracking-tighter uppercase italic leading-[0.85]">Neural Core <br /> <span className="text-zinc-500 italic">Awaiting Input</span></h3>
                            <p className="text-sm text-zinc-500 font-bold leading-relaxed max-w-sm mx-auto uppercase tracking-widest opacity-60">
                                Global university corpus synced. Query any node for instant verification.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-4 justify-center">
                            {[
                                "Semester Withdrawal Policy",
                                "Post-Grad Research Portal",
                                "Faculty Board Deadlines",
                                "Academic Scholarship Data"
                            ].map((suggestion, i) => (
                                <motion.button
                                    key={suggestion}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    onClick={() => setInput(suggestion)}
                                    className="px-8 py-4 text-[9px] font-black uppercase tracking-[0.2em] rounded-full border border-white/5 bg-white/[0.02] hover:bg-white hover:text-black hover:border-white transition-all shadow-2xl"
                                >
                                    {suggestion}
                                </motion.button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto w-full">
                        {messages.map((msg, i) => (
                            <MessageBubble key={i} message={msg} />
                        ))}
                        {isQuerying && !hasStreamingAssistant && (
                            <motion.div
                                className="flex justify-start mb-12"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                <div className="space-y-4 w-full max-w-[70%]">
                                    <div className="flex items-center gap-3 mb-2 px-1">
                                        <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center">
                                            <Zap className="w-5 h-5 text-white animate-pulse" />
                                        </div>
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em] animate-pulse text-zinc-500">Traversing Neural Corpus...</span>
                                    </div>
                                    <div className="h-24 glass rounded-[2.5rem] border-dashed border-white/10 animate-pulse w-full relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Console */}
            <div className="p-10 border-t border-white/5 bg-black/40 backdrop-blur-3xl relative z-20">
                <form onSubmit={handleSend} className="relative max-w-4xl mx-auto group">
                    <div className="absolute -inset-1 bg-white/5 rounded-[2.5rem] blur-2xl opacity-0 group-focus-within:opacity-100 transition-opacity" />

                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="INITIATE NEURAL QUERY..."
                        className="h-24 pl-12 pr-24 bg-white/[0.02] border-none focus:bg-white focus:text-black font-black tracking-tight text-xl transition-all rounded-[2rem] shadow-2xl relative z-10 placeholder:text-zinc-800 placeholder:italic"
                        disabled={isQuerying}
                    />

                    <div className="absolute right-6 top-1/2 -translate-y-1/2 z-20">
                        <Button
                            type="submit"
                            size="icon"
                            className="h-14 w-14 rounded-2xl bg-white text-black hover:bg-zinc-200 shadow-2xl transition-all hover:scale-105 active:scale-95"
                            disabled={!input.trim() || isQuerying}
                        >
                            <Send className="w-6 h-6" />
                        </Button>
                    </div>
                </form>

                <div className="flex items-center justify-center gap-12 mt-8 opacity-20">
                    {[
                        { icon: Shield, label: "Quantum Encrypted Tunnel" },
                        { icon: Cpu, label: "Monolithic Data Sharding" }
                    ].map((badge) => (
                        <div key={badge.label} className="flex items-center gap-3">
                            <badge.icon className="w-4 h-4" />
                            <span className="text-[9px] font-black uppercase tracking-[0.4em]">{badge.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
