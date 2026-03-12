/**
 * UniGPT API Client
 * Typed API client for communicating with the Hybrid FastAPI backend.
 */

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

interface RequestOptions {
    method?: string;
    body?: unknown;
    token?: string;
    isFormData?: boolean;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, token, isFormData = false } = options;
    const headers: Record<string, string> = {};
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const config: RequestInit = { method, headers };
    if (body) {
        config.body = isFormData ? (body as FormData) : JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${path}`, config);
    if (!response.ok) {
        if (response.status === 401 && options.token) {
            // Auto-logout ONLY if an authenticated request gets rejected (corrupted/expired token).
            // Do NOT redirect for failed logins.
            localStorage.removeItem('unigpt-auth');
            window.location.href = '/auth/login';
        }
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return response.json();
}

export const authApi = {
    signup: (data: { email: string; password: string; full_name: string; department?: string; role?: string }) =>
        request<{ message: string; email: string }>('/auth/signup', { method: 'POST', body: data }),

    verifySignup: (data: { email: string; otp: string }) =>
        request<{ access_token: string; user: UserProfile }>('/auth/verify', { method: 'POST', body: data }),

    forgotPassword: (data: { email: string }) =>
        request<{ status: string; message: string }>('/auth/forgot-password', { method: 'POST', body: data }),

    resetPassword: (data: { email: string; otp: string; new_password: string }) =>
        request<{ status: string; message: string }>('/auth/reset-password', { method: 'POST', body: data }),

    googleAuth: () =>
        request<{ url: string }>('/auth/google', { method: 'GET' }),

    microsoftAuth: () =>
        request<{ url: string }>('/auth/microsoft', { method: 'GET' }),

    login: (data: { email: string; password: string }) =>
        request<{ access_token: string; user: UserProfile }>('/auth/login', { method: 'POST', body: data }),
    getMe: (token: string) =>
        request<UserProfile>('/user/me', { token }),
    listUsers: (token: string) =>
        request<UserProfile[]>('/auth/users', { token }),
    inviteUser: (token: string, data: { email: string; full_name: string; role: string }) =>
        request<void>('/auth/invite', { method: 'POST', body: data, token }),
};

export const documentsApi = {
    list: (token: string, params?: { page?: number; doc_type?: string }) => {
        const query = new URLSearchParams();
        if (params?.page) query.set('page', String(params.page));
        if (params?.doc_type) query.set('doc_type', params.doc_type);
        return request<DocumentListResponse>(`/documents?${query.toString()}`, { token });
    },
    upload: (token: string, formData: FormData) =>
        request<DocumentResponse>('/admin/documents', { method: 'POST', body: formData, token, isFormData: true }),
    delete: (token: string, id: string) =>
        request<void>(`/admin/documents/${id}`, { method: 'DELETE', token }),
};

export const agentApi = {
    query: (token: string, data: { query: string; context?: { dept?: string }; conversation_id?: string }) =>
        request<AgentQueryResponse>('/agent/query', { method: 'POST', body: data, token }),
    getHistory: (token: string) =>
        request<ConversationListResponse>('/agent/history', { token }),
    getConversation: (token: string, id: string) =>
        request<ConversationResponse>(`/agent/conversation/${id}`, { token }),
};

export const adminApi = {
    getAuditLogs: (token: string) =>
        request<AuditLogListResponse>('/admin/audit', { token })
};

export const systemApi = {
    metrics: (token: string) =>
        request<MetricsResponse>('/admin/metrics', { token })
};

export interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    role: 'student' | 'faculty' | 'admin';
    department?: string;
    created_at?: string;
    profileImage?: string | null;
    academic_verified?: boolean;
    identity_provider?: string | null;
}

export interface DocumentResponse {
    id: string;
    filename: string;
    doc_type: string;
    role?: string; // Alias for doc_type if needed
    department?: string;
    course?: string;
    tags: string[];
    visibility: boolean;
    uploaded_at?: string;
    created_at?: string; // Alias for uploaded_at
}

export interface DocumentListResponse {
    documents: DocumentResponse[];
    total: number;
    page: number;
    per_page: number;
}

export interface AgentQueryResponse {
    answer: string;
    sources: Array<{ document_id: string; title: string; snippet: string; metadata?: Record<string, unknown> }>;
    conversation_id: string;
    role_badge: string;
    rationale?: string;
}

export interface ConversationResponse {
    id: string;
    title: string;
    role: string;
    messages: Array<{ role: string; content: string }>;
    last_active?: string;
}

export interface ConversationListResponse {
    conversations: ConversationResponse[];
    total: number;
}

export interface AuditLogEntry {
    id: string;
    action: string;
    user_id?: string;
    user?: { email: string; full_name: string };
    target_id?: string;
    payload?: unknown;
    timestamp?: string;
    created_at?: string; // Alias for timestamp
}

export interface AuditLogListResponse {
    logs: AuditLogEntry[];
    total: number;
}

export interface MetricsResponse {
    stats: {
        total_documents: number;
        total_embeddings: number;
        total_conversations: number;
        total_users: number;
        total_chats: number;
    };
}

export interface SourceCitation {
    document_id: string;
    title: string;
    snippet: string;
    relevance_score?: number;
    metadata?: Record<string, unknown>;
}
