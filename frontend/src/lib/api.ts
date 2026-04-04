/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

/**
 * UnivGPT API Client
 * Typed API client for communicating with the Hybrid FastAPI backend.
 */

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
const responseCache = new Map<string, { expiresAt: number; data: unknown }>();
const inflightCache = new Map<string, Promise<unknown>>();
const API_CACHE_STORAGE_KEY = 'unigpt-api-response-cache-v1';
let persistedCacheHydrated = false;

interface RequestOptions {
    method?: string;
    body?: unknown;
    token?: string;
    isFormData?: boolean;
    timeoutMs?: number;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, token, isFormData = false } = options;
    const timeoutMs = options.timeoutMs ?? (method === 'GET' ? 45_000 : 90_000);
    const headers: Record<string, string> = {};
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const config: RequestInit = { method, headers, signal: controller.signal };
    if (body) {
        config.body = isFormData ? (body as FormData) : JSON.stringify(body);
    }

    try {
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
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw new Error('Request timed out. Please retry.');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function tokenSuffix(token?: string) {
    if (!token) return 'anon';
    return token.slice(-12);
}

function buildCacheKey(namespace: string, token?: string, params?: string) {
    return `${namespace}:${tokenSuffix(token)}:${params || ''}`;
}

function canUseSessionStorage() {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function hydratePersistedCache() {
    if (persistedCacheHydrated || !canUseSessionStorage()) return;
    persistedCacheHydrated = true;
    try {
        const raw = window.sessionStorage.getItem(API_CACHE_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, { expiresAt: number; data: unknown }>;
        const now = Date.now();
        Object.entries(parsed || {}).forEach(([key, value]) => {
            if (value && typeof value.expiresAt === 'number' && value.expiresAt > now) {
                responseCache.set(key, value);
            }
        });
    } catch {
        // Ignore broken persisted cache payloads.
    }
}

function persistResponseCache() {
    if (!canUseSessionStorage()) return;
    try {
        const now = Date.now();
        const payload = Object.fromEntries(
            Array.from(responseCache.entries()).filter(([, value]) => value.expiresAt > now),
        );
        window.sessionStorage.setItem(API_CACHE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // Ignore persistence failures.
    }
}

function peekCachedValue<T>(key: string): T | undefined {
    hydratePersistedCache();
    const cached = responseCache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
        responseCache.delete(key);
        persistResponseCache();
        return undefined;
    }
    return cached.data as T;
}

async function cachedGet<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
): Promise<T> {
    hydratePersistedCache();
    const now = Date.now();
    const cached = responseCache.get(key);
    if (cached) {
        if (cached.expiresAt > now) {
            return cached.data as T;
        }
    }

    const inflight = inflightCache.get(key);
    if (inflight) {
        return inflight as Promise<T>;
    }

    const promise = loader()
        .then((data) => {
            responseCache.set(key, { expiresAt: Date.now() + ttlMs, data });
            persistResponseCache();
            return data;
        })
        .catch((err) => {
            const stale = responseCache.get(key);
            if (stale?.data !== undefined) {
                return stale.data as T;
            }
            throw err;
        })
        .finally(() => {
            inflightCache.delete(key);
        });
    inflightCache.set(key, promise);
    return promise;
}

function invalidateCacheByPrefix(prefix: string) {
    hydratePersistedCache();
    for (const key of responseCache.keys()) {
        if (key.startsWith(prefix)) {
            responseCache.delete(key);
        }
    }
    persistResponseCache();
}

function resolveAvatar(user: any): string | null {
    return (
        (user.avatar_url as string | null | undefined) ||
        (user.profileImage as string | null | undefined) ||
        (user.profile_image as string | null | undefined) ||
        (user.profile_picture as string | null | undefined) ||
        (user.avatar as string | null | undefined) ||
        null
    );
}

function normalizeUserProfile(user: UserProfile): UserProfile {
    const avatar = resolveAvatar(user as Partial<UserProfile> & Record<string, unknown>);
    return {
        ...user,
        avatar_url: avatar,
        profileImage: avatar,
    };
}

export const authApi = {
    signup: (data: { email: string; password: string; full_name: string; department?: string; role?: string }) =>
        request<{ message: string; email: string }>('/auth/signup', { method: 'POST', body: data }),

    verifySignup: async (data: { email: string; otp: string; password: string }) => {
        const res = await request<{ access_token: string; user: UserProfile }>('/auth/verify', { method: 'POST', body: data });
        return { ...res, user: normalizeUserProfile(res.user) };
    },
    resendSignupOtp: (data: { email: string }) =>
        request<{ status: string; message: string }>('/auth/resend-otp', { method: 'POST', body: data }),

    forgotPassword: (data: { email: string }) =>
        request<{ status: string; message: string }>('/auth/forgot-password', { method: 'POST', body: data }),

    resetPassword: (data: { email: string; otp: string; new_password: string }) =>
        request<{ status: string; message: string }>('/auth/reset-password', { method: 'POST', body: data }),

    googleAuth: (role: string) =>
        request<{ url: string }>(`/auth/google?role=${encodeURIComponent(role)}`, { method: 'GET' }),

    login: async (data: { email: string; password: string; role?: string }) => {
        const res = await request<{ access_token: string; user: UserProfile }>('/auth/login', { method: 'POST', body: data });
        return { ...res, user: normalizeUserProfile(res.user) };
    },
    getMe: async (token: string) =>
        normalizeUserProfile(await cachedGet(
            buildCacheKey('user-me', token),
            20_000,
            () => request<UserProfile>('/user/me', { token, timeoutMs: 20_000 }),
        )),
    updateProfile: async (
        token: string,
        data: Partial<Pick<UserProfile, 'full_name' | 'department' | 'program' | 'semester' | 'section' | 'roll_number' | 'avatar_url'>>
    ) => request<UserProfile>('/user/profile', { method: 'PATCH', token, body: data }).then((res) => {
        const suffix = tokenSuffix(token);
        invalidateCacheByPrefix(`user-me:${suffix}`);
        invalidateCacheByPrefix(`user-export-data:${suffix}`);
        invalidateCacheByPrefix(`user-faculty:${suffix}`);
        invalidateCacheByPrefix(`user-courses:${suffix}`);
        invalidateCacheByPrefix(`admin-users:${suffix}`);
        persistResponseCache();
        return normalizeUserProfile(res);
    }),
    getSettings: (token: string) =>
        cachedGet(
            buildCacheKey('user-settings', token),
            30_000,
            () => request<UserSettingsResponse>('/user/settings', { token }),
        ),
    peekSettings: (token: string) =>
        peekCachedValue<UserSettingsResponse>(buildCacheKey('user-settings', token)),
    saveSettings: (token: string, settings: UserSettingsPayload) =>
        request<UserSettingsResponse>('/user/settings', { method: 'PUT', token, body: settings }).then((res) => {
            invalidateCacheByPrefix(`user-settings:${tokenSuffix(token)}`);
            invalidateCacheByPrefix(`user-export-data:${tokenSuffix(token)}`);
            return res;
        }),
    getNotifications: (token: string, limit = 20, options?: { force?: boolean }) => {
        const endpoint = `/user/notifications?limit=${encodeURIComponent(String(limit))}`;
        if (options?.force) {
            invalidateCacheByPrefix(`user-notifications:${tokenSuffix(token)}`);
            return request<UserNotificationListResponse>(endpoint, { token });
        }
        return cachedGet(
            buildCacheKey('user-notifications', token, String(limit)),
            25_000,
            () => request<UserNotificationListResponse>(endpoint, { token, timeoutMs: 30_000 }),
        );
    },
    markNotificationsRead: (token: string) =>
        request<UserSettingsResponse>('/user/notifications/read', { method: 'PUT', token }).then((res) => {
            invalidateCacheByPrefix(`user-notifications:${tokenSuffix(token)}`);
            return res;
        }),
    getFacultyDirectory: (token: string, limit = 20) =>
        cachedGet(
            buildCacheKey('user-faculty', token, String(limit)),
            60_000,
            async () => {
                const res = await request<FacultyListResponse>(
                    `/user/faculty?limit=${encodeURIComponent(String(limit))}`,
                    { token, timeoutMs: 30_000 },
                );
                return {
                    ...res,
                    faculty: (res.faculty || []).map((item: FacultySummary) => ({
                        ...item,
                        avatar_url: resolveAvatar(item),
                    })),
                };
            },
        ),
    getCourseDirectory: (token: string, limit = 50) =>
        cachedGet(
            buildCacheKey('user-courses', token, String(limit)),
            60_000,
            () =>
                request<CourseDirectoryResponse>(
                    `/user/courses?limit=${encodeURIComponent(String(limit))}`,
                    { token, timeoutMs: 30_000 },
                ),
        ),
    setRole: async (token: string, role: UserProfile['role']) =>
        request<UserProfile>('/user/role', { method: 'PUT', token, body: { role } }).then((res) => {
            const suffix = tokenSuffix(token);
            invalidateCacheByPrefix(`user-me:${suffix}`);
            invalidateCacheByPrefix(`user-export-data:${suffix}`);
            invalidateCacheByPrefix(`user-faculty:${suffix}`);
            invalidateCacheByPrefix(`user-courses:${suffix}`);
            return normalizeUserProfile(res);
        }),
    exportUserData: (token: string, options?: { force?: boolean }) => {
        if (options?.force) {
            invalidateCacheByPrefix(`user-export-data:${tokenSuffix(token)}`);
        }
        return cachedGet(
            buildCacheKey('user-export-data', token),
            45_000,
            () => request<UserExportData>('/user/export-data', { token, timeoutMs: 20_000 }),
        );
    },
    peekExportUserData: (token: string) =>
        peekCachedValue<UserExportData>(buildCacheKey('user-export-data', token)),
    peekNotifications: (token: string, limit = 20) =>
        peekCachedValue<UserNotificationListResponse>(
            buildCacheKey('user-notifications', token, String(limit)),
        ),
    peekFacultyDirectory: (token: string, limit = 20) =>
        peekCachedValue<FacultyListResponse>(buildCacheKey('user-faculty', token, String(limit))),
    peekCourseDirectory: (token: string, limit = 50) =>
        peekCachedValue<CourseDirectoryResponse>(buildCacheKey('user-courses', token, String(limit))),
    listUsers: async (token: string) =>
        (await request<UserProfile[]>('/auth/users', { token })).map(normalizeUserProfile),
    inviteUser: (token: string, data: { email: string; full_name: string; role: string }) =>
        request<void>('/auth/invite', { method: 'POST', body: data, token }),
};

export const documentsApi = {
    list: (token: string, params?: { page?: number; per_page?: number; doc_type?: string }) => {
        const query = new URLSearchParams();
        if (params?.page) query.set('page', String(params.page));
        if (params?.per_page) query.set('per_page', String(params.per_page));
        if (params?.doc_type) query.set('doc_type', params.doc_type);
        const endpoint = `/documents?${query.toString()}`;
        return cachedGet(
            buildCacheKey('documents-list', token, endpoint),
            25_000,
            () => request<DocumentListResponse>(endpoint, { token, timeoutMs: 25_000 }),
        );
    },
    peekList: (token: string, params?: { page?: number; per_page?: number; doc_type?: string }) => {
        const query = new URLSearchParams();
        if (params?.page) query.set('page', String(params.page));
        if (params?.per_page) query.set('per_page', String(params.per_page));
        if (params?.doc_type) query.set('doc_type', params.doc_type);
        const endpoint = `/documents?${query.toString()}`;
        return peekCachedValue<DocumentListResponse>(buildCacheKey('documents-list', token, endpoint));
    },
    upload: (token: string, formData: FormData) =>
        request<DocumentResponse>('/admin/documents', { method: 'POST', body: formData, token, isFormData: true, timeoutMs: 180_000 }).then((res) => {
            invalidateCacheByPrefix('documents-list:');
            invalidateCacheByPrefix('user-notifications:');
            invalidateCacheByPrefix('user-export-data:');
            return res;
        }),
    update: (
        token: string,
        id: string,
        data: Partial<Pick<DocumentResponse, 'doc_type' | 'department' | 'course' | 'tags' | 'visibility'>> & { metadata?: Record<string, unknown> }
    ) =>
        request<DocumentResponse>(`/admin/documents/${id}`, { method: 'PATCH', body: data, token }).then((res) => {
            invalidateCacheByPrefix('documents-list:');
            invalidateCacheByPrefix('user-notifications:');
            invalidateCacheByPrefix('user-export-data:');
            return res;
        }),
    delete: (token: string, id: string) =>
        request<void>(`/admin/documents/${id}`, { method: 'DELETE', token }).then((res) => {
            invalidateCacheByPrefix('documents-list:');
            invalidateCacheByPrefix('served-notices:');
            invalidateCacheByPrefix('admin-metrics:');
            invalidateCacheByPrefix('admin-audit:');
            invalidateCacheByPrefix('user-notifications:');
            invalidateCacheByPrefix('user-export-data:');
            return res;
        }),
    preview: (token: string, id: string) =>
        request<DocumentPreviewResponse>(`/documents/${encodeURIComponent(id)}/preview`, { token, timeoutMs: 35_000 }),
};

export const noticesApi = {
    serve: (
        token: string,
        body: {
            title: string;
            message: string;
            target: 'students' | 'faculty' | 'both';
            department?: string;
            course?: string;
            tags?: string[];
            attachment_document_id?: string | null;
        },
    ) =>
        request<NoticeServeResponse>(
            '/admin/notices/serve',
            { method: 'POST', token, body, timeoutMs: 45_000 },
        ).then((res) => {
            invalidateCacheByPrefix('documents-list:');
            invalidateCacheByPrefix('user-notifications:');
            invalidateCacheByPrefix('served-notices:');
            invalidateCacheByPrefix('user-export-data:');
            return res;
        }),
    listServed: (token: string, limit = 120) =>
        cachedGet(
            buildCacheKey('served-notices', token, String(limit)),
            20_000,
            () =>
                request<NoticeListResponse>(
                    `/admin/notices/served?limit=${encodeURIComponent(String(limit))}`,
                    { token, timeoutMs: 20_000 },
                ),
        ),
    peekListServed: (token: string, limit = 120) =>
        peekCachedValue<NoticeListResponse>(buildCacheKey('served-notices', token, String(limit))),
};

export const agentApi = {
    query: (token: string, data: { query: string; context?: { dept?: string }; conversation_id?: string }) =>
        request<AgentQueryResponse>('/agent/query', { method: 'POST', body: data, token, timeoutMs: 120_000 }),
    getModerationState: (token: string) =>
        request<{ moderation: ModerationMeta }>('/agent/moderation-state', { token }),
    submitAppeal: (token: string, message: string) =>
        request<AgentAppealResponse>('/agent/appeal', { method: 'POST', token, body: { message } }),
    getHistory: (token: string) =>
        request<ConversationListResponse>('/agent/history', { token }),
    getConversation: (token: string, id: string) =>
        request<ConversationResponse>(`/agent/conversation/${id}`, { token }),
};

export const adminApi = {
    getUsers: (token: string, page = 1, perPage = 100) =>
        cachedGet(
            buildCacheKey('admin-users', token, `${page}:${perPage}`),
            45_000,
            async () => {
                const res = await request<{ users: UserProfile[]; total: number; page: number; per_page: number }>(
                    `/admin/users?page=${encodeURIComponent(String(page))}&per_page=${encodeURIComponent(String(perPage))}`,
                    { token, timeoutMs: 25_000 },
                );
                return {
                    ...res,
                    users: (res.users || []).map(normalizeUserProfile),
                };
            },
        ),
    peekUsers: (token: string, page = 1, perPage = 100) =>
        peekCachedValue<{ users: UserProfile[]; total: number; page: number; per_page: number }>(
            buildCacheKey('admin-users', token, `${page}:${perPage}`),
        ),
    updateUser: (
        token: string,
        userId: string,
        data: Partial<Pick<UserProfile, 'full_name' | 'role' | 'department'>>,
    ) =>
        request<{ user: UserProfile }>(
            `/admin/users/${encodeURIComponent(userId)}`,
            { method: 'PATCH', token, body: data },
        ).then((res) => {
            invalidateCacheByPrefix(`admin-users:${tokenSuffix(token)}`);
            invalidateCacheByPrefix(`admin-metrics:${tokenSuffix(token)}`);
            return {
                ...res,
                user: normalizeUserProfile(res.user),
            };
        }),
    getAuditLogs: (token: string, page = 1, perPage = 20) =>
        cachedGet(
            buildCacheKey('admin-audit', token, `${page}:${perPage}`),
            25_000,
            () => request<AuditLogListResponse>(
                `/admin/audit?page=${encodeURIComponent(String(page))}&per_page=${encodeURIComponent(String(perPage))}`,
                { token, timeoutMs: 25_000 },
            ),
        ),
    peekAuditLogs: (token: string, page = 1, perPage = 20) =>
        peekCachedValue<AuditLogListResponse>(
            buildCacheKey('admin-audit', token, `${page}:${perPage}`),
        ),
    getDeanAppeals: (token: string, status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending', limit = 100) =>
        cachedGet(
            buildCacheKey('admin-dean-appeals', token, `${status}:${limit}`),
            20_000,
            () => request<{ appeals: DeanAppealItem[]; total: number; status: string }>(
                `/admin/dean/appeals?status=${encodeURIComponent(status)}&limit=${encodeURIComponent(String(limit))}`,
                { token, timeoutMs: 25_000 },
            ),
        ),
    peekDeanAppeals: (
        token: string,
        status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending',
        limit = 100,
    ) =>
        peekCachedValue<{ appeals: DeanAppealItem[]; total: number; status: string }>(
            buildCacheKey('admin-dean-appeals', token, `${status}:${limit}`),
        ),
    approveDeanAppeal: (token: string, userId: string, note?: string) =>
        request<{ status: string; message: string; moderation?: ModerationMeta }>(
            `/admin/dean/appeals/${encodeURIComponent(userId)}/approve`,
            { method: 'POST', token, body: { note: note || null } },
        ).then((res) => {
            invalidateCacheByPrefix(`admin-dean-appeals:${tokenSuffix(token)}`);
            invalidateCacheByPrefix(`admin-audit:${tokenSuffix(token)}`);
            invalidateCacheByPrefix(`user-notifications:${tokenSuffix(token)}`);
            return res;
        }),
    rejectDeanAppeal: (token: string, userId: string, note?: string) =>
        request<{ status: string; message: string; moderation?: ModerationMeta }>(
            `/admin/dean/appeals/${encodeURIComponent(userId)}/reject`,
            { method: 'POST', token, body: { note: note || null } },
        ).then((res) => {
            invalidateCacheByPrefix(`admin-dean-appeals:${tokenSuffix(token)}`);
            invalidateCacheByPrefix(`admin-audit:${tokenSuffix(token)}`);
            invalidateCacheByPrefix(`user-notifications:${tokenSuffix(token)}`);
            return res;
        }),
    resetUserFlags: (token: string, userId: string, note?: string) =>
        request<{ status: string; message: string; moderation?: ModerationMeta }>(
            `/admin/dean/users/${encodeURIComponent(userId)}/reset-flags`,
            { method: 'POST', token, body: { note: note || null } },
        ).then((res) => {
            invalidateCacheByPrefix(`admin-dean-appeals:${tokenSuffix(token)}`);
            invalidateCacheByPrefix(`admin-audit:${tokenSuffix(token)}`);
            invalidateCacheByPrefix(`user-notifications:${tokenSuffix(token)}`);
            return res;
        }),
    createUserActivityReportNotice: (
        token: string,
        body: {
            subject?: string;
            message?: string;
            include_zero_query_users?: boolean;
            max_recipients?: number;
        },
    ) =>
        request<UserActivityReportNoticeResponse>(
            `/admin/reports/user-activity-notice`,
            { method: 'POST', token, body, timeoutMs: 120_000 },
        ),
    previewUserActivityReportNotice: (
        token: string,
        body: {
            subject?: string;
            message?: string;
            include_zero_query_users?: boolean;
            max_recipients?: number;
        },
    ) =>
        request<UserActivityReportPreviewResponse>(
            `/admin/reports/user-activity-notice/preview`,
            { method: 'POST', token, body, timeoutMs: 60_000 },
        ),
};

export const systemApi = {
    metrics: (token: string) =>
        cachedGet(
            buildCacheKey('admin-metrics', token),
            30_000,
            () => request<MetricsResponse>('/admin/metrics', { token, timeoutMs: 25_000 }),
        ),
    peekMetrics: (token: string) =>
        peekCachedValue<MetricsResponse>(buildCacheKey('admin-metrics', token)),
};

export interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    role: 'student' | 'faculty' | 'admin';
    department?: string;
    program?: string | null;
    semester?: string | null;
    section?: string | null;
    roll_number?: string | null;
    avatar_url?: string | null;
    created_at?: string;
    profileImage?: string | null;
    profile_image?: string | null;
    profile_picture?: string | null;
    avatar?: string | null;
    academic_verified?: boolean;
    identity_provider?: string | null;
}

export interface UserExportData {
    exportDate: string;
    profile: {
        name: string;
        email: string;
        role: 'student' | 'faculty' | 'admin';
        department?: string | null;
        program?: string | null;
        semester?: string | null;
        section?: string | null;
        roll_number?: string | null;
        academic_verified?: boolean;
        member_since?: string | null;
    };
    queries: number;
    documents: number;
    notices: number;
}

export interface UserSettingsPayload {
    emailNotifications: boolean;
    pushNotifications: boolean;
    reducedMotion: boolean;
}

export interface UserSettingsResponse {
    settings: UserSettingsPayload;
}

export interface UserNotificationItem {
    id: string;
    title: string;
    message: string;
    course?: string | null;
    department?: string | null;
    uploaded_at?: string | null;
    unread: boolean;
}

export interface UserNotificationListResponse {
    notifications: UserNotificationItem[];
    total: number;
    unread: number;
}

export interface FacultySummary {
    id: string;
    full_name: string;
    email: string;
    department?: string | null;
    program?: string | null;
    avatar_url?: string | null;
}

export interface FacultyListResponse {
    faculty: FacultySummary[];
    total: number;
}

export interface CourseDirectoryItem {
    id: string;
    code: string;
    title: string;
    department?: string | null;
    next_update_at?: string | null;
    notice_count: number;
    faculty_ids: string[];
}

export interface CourseDirectoryResponse {
    courses: CourseDirectoryItem[];
    total: number;
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

export interface DocumentPreviewChunk {
    chunk_index: number;
    content: string;
}

export interface DocumentPreviewResponse {
    id: string;
    filename: string;
    doc_type: string;
    department?: string | null;
    course?: string | null;
    tags: string[];
    uploaded_at?: string | null;
    chunk_count: number;
    chunks: DocumentPreviewChunk[];
    has_preview: boolean;
    preview_source: 'pinecone' | 'none' | string;
    is_notice?: boolean;
    notice_title?: string | null;
    notice_message?: string | null;
    attachment_document_id?: string | null;
    attachment_filename?: string | null;
}

export interface ServedNoticeItem {
    id: string;
    title: string;
    message: string;
    doc_type: string;
    department?: string | null;
    course?: string | null;
    uploaded_at?: string | null;
    attachment_document_id?: string | null;
    attachment_filename?: string | null;
}

export interface NoticeListResponse {
    items: ServedNoticeItem[];
    total: number;
}

export interface NoticeServeResponse {
    status: string;
    message: string;
    target: 'students' | 'faculty' | 'both' | string;
    created: Array<{
        id: string;
        doc_type: string;
        department?: string | null;
        course?: string | null;
        title?: string;
    }>;
    failed: string[];
}

export interface AgentQueryResponse {
    answer: string;
    sources: Array<{ document_id: string; title: string; snippet: string; metadata?: Record<string, unknown> }>;
    conversation_id: string;
    role_badge: string;
    rationale?: string;
    moderation?: ModerationMeta;
}

export interface ModerationMeta {
    blocked: boolean;
    warning_count: number;
    max_warnings: number;
    offense_total: number;
    appeal_required: boolean;
    appeal_status?: string | null;
    appeal_submitted_at?: string | null;
    blocked_at?: string | null;
}

export interface AgentAppealResponse {
    status: string;
    message: string;
    moderation?: ModerationMeta;
}

export interface DeanAppealItem {
    user_id: string;
    email?: string | null;
    full_name?: string | null;
    role?: string | null;
    department?: string | null;
    blocked: boolean;
    blocked_at?: string | null;
    offense_total: number;
    warning_count: number;
    offensive_messages: string[];
    appeal: {
        status: string;
        message?: string | null;
        submitted_at?: string | null;
        reviewed_at?: string | null;
        reviewed_by?: string | null;
        decision_note?: string | null;
    };
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
    user?: { email: string; full_name: string; role?: string };
    target_id?: string;
    payload?: unknown;
    ip_address?: string;
    status?: string;
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
    breakdowns?: {
        users_by_role?: {
            student?: number;
            faculty?: number;
            admin?: number;
        };
        documents_by_type?: Record<string, number>;
    };
    timeseries?: {
        last_7_days?: Array<{
            date: string;
            queries: number;
            uploads: number;
            admin: number;
            auth: number;
        }>;
    };
}

export interface SourceCitation {
    document_id: string;
    title: string;
    snippet: string;
    relevance_score?: number;
    metadata?: Record<string, unknown>;
}

export interface UserActivityReportNoticeResponse {
    status: string;
    message: string;
    subject: string;
    generated_at: string;
    stats: {
        total_users: number;
        total_queries: number;
        active_users: number;
        queries_per_user_avg: number;
        users_by_role: {
            student: number;
            faculty: number;
            admin: number;
        };
    };
    top_users: Array<{
        id: string;
        full_name: string;
        email: string;
        role: string;
        query_count: number;
        active_days_30: number;
        account_age_days: number;
        joined_at?: string | null;
        last_query_at?: string | null;
    }>;
    recipients_sent: number;
    recipients_failed: number;
    duplicate_rows_skipped?: number;
}

export interface UserActivityReportPreviewResponse {
    status: string;
    message: string;
    generated_at: string;
    duplicate_rows_skipped: number;
    recipients_total: number;
    preview_limit: number;
    preview_recipients: Array<{
        id: string;
        full_name: string;
        email: string;
        role: string;
        query_count: number;
        active_days_30: number;
        account_age_days: number;
        joined_at?: string | null;
        last_query_at?: string | null;
    }>;
    stats: {
        total_users: number;
        total_queries: number;
        active_users: number;
        queries_per_user_avg: number;
        users_by_role: {
            student: number;
            faculty: number;
            admin: number;
        };
    };
    top_users: Array<{
        id: string;
        full_name: string;
        email: string;
        role: string;
        query_count: number;
        active_days_30: number;
        account_age_days: number;
        joined_at?: string | null;
        last_query_at?: string | null;
    }>;
}


