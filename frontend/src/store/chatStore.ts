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
    conversations: ConversationResponse[];
    currentConversationId: string | null;
    messages: ChatMessage[];
    isQuerying: boolean;
    error: string | null;

    sendQuery: (token: string, query: string, context?: { dept?: string; course?: string }) => Promise<void>;
    loadHistory: (token: string) => Promise<void>;
    loadConversation: (token: string, id: string) => Promise<void>;
    newConversation: () => void;
    clearError: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
    conversations: [],
    currentConversationId: null,
    messages: [],
    isQuerying: false,
    error: null,

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
            await streamTextToMessage(assistantMessage.id, res.answer);
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
        } catch (err: unknown) {
            set({ error: (err as Error).message });
        }
    },

    newConversation: () => {
        set({ currentConversationId: null, messages: [], error: null });
    },

    clearError: () => set({ error: null }),
}));
