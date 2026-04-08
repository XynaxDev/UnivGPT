/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

/**
 * Chat Store (Zustand)
 * Manages chat conversations, messages, and agent interactions.
 */

import { create } from 'zustand';
import { agentApi, type ConversationResponse, type SourceCitation, type ModerationMeta } from '@/lib/api';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: SourceCitation[];
    roleBadge?: string;
    rationale?: string;
    moderation?: ModerationMeta;
    isStreaming?: boolean;
    timestamp: string;
}

interface ChatState {
    activeScope: string;
    conversations: ConversationResponse[];
    currentConversationId: string | null;
    messages: ChatMessage[];
    isQuerying: boolean;
    error: string | null;

    setScope: (scope: string) => void;
    sendQuery: (token: string, query: string, context?: { dept?: string; course?: string }) => Promise<void>;
    loadHistory: (token: string) => Promise<void>;
    loadConversation: (token: string, id: string) => Promise<void>;
    newConversation: () => void;
    clearError: () => void;
}

const CHAT_STORAGE_KEY = 'unigpt-chat-scope-v1';

function canUseSessionStorage() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readScopeCache(scope: string) {
    if (!canUseSessionStorage()) return null;
    try {
        const raw = window.localStorage.getItem(`${CHAT_STORAGE_KEY}:${scope}`);
        const legacy = window.sessionStorage.getItem(`${CHAT_STORAGE_KEY}:${scope}`);
        if (!raw && legacy) {
            window.localStorage.setItem(`${CHAT_STORAGE_KEY}:${scope}`, legacy);
        }
        const source = raw || legacy;
        if (!source) return null;
        const parsed = JSON.parse(source) as Pick<ChatState, 'currentConversationId' | 'messages'>;
        return parsed;
    } catch {
        return null;
    }
}

function writeScopeCache(scope: string, payload: Pick<ChatState, 'currentConversationId' | 'messages'>) {
    if (!canUseSessionStorage()) return;
    try {
        window.localStorage.setItem(`${CHAT_STORAGE_KEY}:${scope}`, JSON.stringify(payload));
    } catch {
        // Ignore cache persistence failures.
    }
}

export function clearAllChatCaches() {
    if (!canUseSessionStorage()) return;
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (key?.startsWith(`${CHAT_STORAGE_KEY}:`)) {
                keysToRemove.push(key);
            }
        }
        for (let i = 0; i < window.sessionStorage.length; i += 1) {
            const key = window.sessionStorage.key(i);
            if (key?.startsWith(`${CHAT_STORAGE_KEY}:`)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach((key) => {
            window.localStorage.removeItem(key);
            window.sessionStorage.removeItem(key);
        });
    } catch {
        // Ignore storage clear failures.
    }
    useChatStore.setState({
        activeScope: 'default',
        conversations: [],
        currentConversationId: null,
        messages: [],
        isQuerying: false,
        error: null,
    });
}

export const useChatStore = create<ChatState>()((set, get) => ({
    activeScope: 'default',
    conversations: [],
    currentConversationId: null,
    messages: [],
    isQuerying: false,
    error: null,

    setScope: (scope) => {
        const nextScope = String(scope || '').trim() || 'default';
        const currentScope = get().activeScope;
        if (currentScope === nextScope) return;
        const cached = readScopeCache(nextScope);
        set({
            activeScope: nextScope,
            conversations: [],
            currentConversationId: cached?.currentConversationId || null,
            messages: cached?.messages || [],
            isQuerying: false,
            error: null,
        });
    },

    sendQuery: async (token, query, context) => {
        const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        const streamTextToMessage = async (messageId: string, fullText: string) => {
            const safeText = String(fullText || '');
            const total = safeText.length;
            if (!total) {
                set((state) => ({
                    messages: state.messages.map((m) =>
                        m.id === messageId ? { ...m, content: '', isStreaming: false } : m,
                    ),
                }));
                return;
            }

            let cursor = 0;
            while (cursor < total) {
                const remaining = total - cursor;
                const chunk =
                    remaining > 1200 ? 18 :
                    remaining > 800 ? 14 :
                    remaining > 400 ? 10 :
                    remaining > 180 ? 7 : 4;
                cursor = Math.min(total, cursor + chunk);
                const partial = safeText.slice(0, cursor);
                set((state) => ({
                    messages: state.messages.map((m) =>
                        m.id === messageId ? { ...m, content: partial, isStreaming: cursor < total } : m,
                    ),
                }));
                await sleep(14);
            }
        };

        const state = get();
        const userMessage: ChatMessage = {
            id: makeId(),
            role: 'user',
            content: query,
            timestamp: new Date().toISOString(),
        };
        set({ messages: [...state.messages, userMessage], isQuerying: true, error: null });
        writeScopeCache(state.activeScope, {
            currentConversationId: state.currentConversationId,
            messages: [...state.messages, userMessage],
        });

        try {
            const res = await agentApi.query(token, {
                query,
                context,
                conversation_id: state.currentConversationId || undefined,
            });

            const assistantMessage: ChatMessage = {
                id: makeId(),
                role: 'assistant',
                content: '',
                sources: res.sources,
                roleBadge: res.role_badge,
                rationale: res.rationale,
                moderation: res.moderation,
                isStreaming: true,
                timestamp: new Date().toISOString(),
            };

            set({
                messages: [...get().messages, assistantMessage],
                currentConversationId: res.conversation_id,
            });
            writeScopeCache(get().activeScope, {
                currentConversationId: res.conversation_id,
                messages: [...get().messages, assistantMessage],
            });
            await streamTextToMessage(assistantMessage.id, res.answer);
            writeScopeCache(get().activeScope, {
                currentConversationId: res.conversation_id,
                messages: get().messages,
            });
            set({ isQuerying: false });
        } catch (err: unknown) {
            set({ error: (err as Error).message || 'Query failed', isQuerying: false });
        }
    },

    loadHistory: async (token) => {
        try {
            const res = await agentApi.getHistory(token);
            set({ conversations: res.conversations });
        } catch (err: unknown) {
            set({ error: (err as Error).message });
        }
    },

    loadConversation: async (token, id) => {
        try {
            const res = await agentApi.getConversation(token, id);
            const messages: ChatMessage[] = (res.messages || []).map((m: Record<string, unknown>) => ({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                role: m.role as 'user' | 'assistant',
                content: m.content as string,
                sources: m.sources as SourceCitation[],
                roleBadge: m.role_badge as string | undefined,
                rationale: m.rationale as string | undefined,
                moderation: m.moderation as ModerationMeta | undefined,
                isStreaming: false,
                timestamp: new Date().toISOString(),
            }));
            set({ currentConversationId: id, messages });
            writeScopeCache(get().activeScope, { currentConversationId: id, messages });
        } catch (err: unknown) {
            set({ error: (err as Error).message });
        }
    },

    newConversation: () => {
        set({ currentConversationId: null, messages: [], error: null });
        writeScopeCache(get().activeScope, { currentConversationId: null, messages: [] });
    },

    clearError: () => set({ error: null }),
}));


