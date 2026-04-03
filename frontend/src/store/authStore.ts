/**
 * Auth Store (Zustand)
 * Integrated with Supabase Auth via Backend.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, type UserProfile } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const PROFILE_IMAGE_CACHE_KEY = 'unigpt-profile-images';

type ProfileImageCache = Record<string, string>;

const normalizeEmail = (email?: string) => email?.trim().toLowerCase() || '';

const readProfileImageCache = (): ProfileImageCache => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(PROFILE_IMAGE_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
            return parsed as ProfileImageCache;
        }
    } catch {
        // Ignore corrupted cache and treat as empty.
    }
    return {};
};

const writeProfileImageCache = (cache: ProfileImageCache) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(PROFILE_IMAGE_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // Ignore storage write failures.
    }
};

const persistProfileImageForEmail = (email?: string, profileImage?: string | null) => {
    const key = normalizeEmail(email);
    if (!key) return;
    const cache = readProfileImageCache();
    if (profileImage) {
        cache[key] = profileImage;
    } else {
        delete cache[key];
    }
    writeProfileImageCache(cache);
};

const hydrateProfileImage = (user: UserProfile): UserProfile => {
    const key = normalizeEmail(user.email);
    const backendImage = user.avatar_url || user.profileImage || null;
    if (backendImage) {
        persistProfileImageForEmail(user.email, backendImage);
        return { ...user, avatar_url: backendImage, profileImage: backendImage };
    }

    if (!key) return user;

    const cache = readProfileImageCache();
    if (cache[key]) {
        return { ...user, avatar_url: cache[key], profileImage: cache[key] };
    }

    return { ...user, avatar_url: null, profileImage: null };
};

interface AuthState {
    user: UserProfile | null;
    token: string | null;
    isLoading: boolean;
    isInitializing: boolean;
    error: string | null;

    login: (email: string, password: string, role?: UserProfile['role']) => Promise<void>;
    signup: (
        email: string,
        password: string,
        fullName: string,
        role: UserProfile['role'],
        department?: string
    ) => Promise<void>;
    verifySignup: (email: string, otp: string, password: string) => Promise<void>;
    resendSignupOtp: (email: string) => Promise<string>;
    forgotPassword: (email: string) => Promise<string>;
    resetPassword: (email: string, otp: string, newPassword: string) => Promise<string>;
    googleAuth: (role: UserProfile['role']) => Promise<void>;
    logout: () => Promise<void>;
    clearSession: () => void;
    clearError: () => void;
    fetchProfile: () => Promise<void>;
    setSession: (token: string, user: UserProfile) => void;
    finishInitializing: () => void;
    updateUser: (updates: Partial<UserProfile>) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            isLoading: false,
            isInitializing: true,
            error: null,

            login: async (email, password, role) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await authApi.login({ email, password, role });
                    set({ user: hydrateProfileImage(res.user), token: res.access_token, isLoading: false });
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'Login failed', isLoading: false });
                    throw err;
                }
            },

            signup: async (email, password, fullName, role, department) => {
                set({ isLoading: true, error: null });
                try {
                    await authApi.signup({ email, password, full_name: fullName, role, department });
                    set({ isLoading: false });
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'Signup failed', isLoading: false });
                    throw err;
                }
            },

            verifySignup: async (email, otp, password) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await authApi.verifySignup({ email, otp, password });
                    set({ user: hydrateProfileImage(res.user), token: res.access_token, isLoading: false });
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'OTP verification failed', isLoading: false });
                    throw err;
                }
            },

            resendSignupOtp: async (email) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await authApi.resendSignupOtp({ email });
                    set({ isLoading: false });
                    return res.message;
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'Failed to resend OTP', isLoading: false });
                    throw err;
                }
            },

            forgotPassword: async (email) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await authApi.forgotPassword({ email });
                    set({ isLoading: false });
                    return res.message;
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'Failed to send recovery OTP', isLoading: false });
                    throw err;
                }
            },

            resetPassword: async (email, otp, newPassword) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await authApi.resetPassword({ email, otp, new_password: newPassword });
                    set({ isLoading: false });
                    return res.message;
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'Invalid OTP or reset failed', isLoading: false });
                    throw err;
                }
            },

            googleAuth: async (role) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await authApi.googleAuth(role);
                    if (res.url) {
                        window.location.href = res.url;
                    }
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'Google Auth failed', isLoading: false });
                    throw err;
                }
            },

            clearSession: () => {
                if (typeof window !== 'undefined') {
                    window.localStorage.removeItem('unigpt:pending-role');
                    window.localStorage.removeItem('unigpt-auth');
                }
                set({ user: null, token: null, error: null, isLoading: false });
            },

            logout: async () => {
                try {
                    await supabase.auth.signOut({ scope: 'local' });
                } catch {
                    // Ignore Supabase sign-out transport errors and still clear local app session.
                } finally {
                    get().clearSession();
                }
            },

            clearError: () => set({ error: null }),

            fetchProfile: async () => {
                const token = get().token;
                if (!token) return;
                try {
                    const user = await authApi.getMe(token);
                    set({ user: hydrateProfileImage(user) });
                } catch {
                    set({ user: null, token: null });
                }
            },

            setSession: (token, user) => {
                set({ token, user: hydrateProfileImage(user), isLoading: false, isInitializing: false, error: null });
            },

            finishInitializing: () => {
                set({ isInitializing: false });
            },

            updateUser: (updates) => {
                const current = get().user;
                if (current) {
                    const nextUser = {
                        ...current,
                        ...updates,
                        avatar_url: (updates as any).avatar_url ?? (updates as any).profileImage ?? current.avatar_url ?? null,
                    };
                    if ("profileImage" in updates && !(updates as any).avatar_url) {
                        nextUser.avatar_url = (updates as any).profileImage ?? null;
                    }
                    nextUser.profileImage = nextUser.avatar_url ?? null;

                    if ('profileImage' in updates) {
                        persistProfileImageForEmail(nextUser.email, updates.profileImage ?? null);
                    } else if ('avatar_url' in (updates as any)) {
                        persistProfileImageForEmail(nextUser.email, (updates as any).avatar_url ?? null);
                    } else if ('email' in updates && current.profileImage) {
                        persistProfileImageForEmail(nextUser.email, current.profileImage);
                        if (normalizeEmail(nextUser.email) !== normalizeEmail(current.email)) {
                            persistProfileImageForEmail(current.email, null);
                        }
                    }

                    set({ user: nextUser });
                }
            },
        }),
        {
            name: 'unigpt-auth',
            partialize: (state) => ({ user: state.user, token: state.token }),
        }
    )
);
