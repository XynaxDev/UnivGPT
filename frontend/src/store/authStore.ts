/**
 * Auth Store (Zustand)
 * Integrated with Supabase Auth via Backend.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, type UserProfile } from '@/lib/api';

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
    if (!key) return user;

    const cache = readProfileImageCache();
    if (cache[key]) {
        return { ...user, profileImage: cache[key] };
    }

    if (user.profileImage) {
        persistProfileImageForEmail(user.email, user.profileImage);
    }

    return user;
};

interface AuthState {
    user: UserProfile | null;
    token: string | null;
    isLoading: boolean;
    isInitializing: boolean;
    error: string | null;

    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, fullName: string, department?: string) => Promise<void>;
    verifySignup: (email: string, otp: string) => Promise<void>;
    forgotPassword: (email: string) => Promise<string>;
    resetPassword: (email: string, otp: string, newPassword: string) => Promise<string>;
    googleAuth: () => Promise<void>;
    logout: () => void;
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

            login: async (email, password) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await authApi.login({ email, password });
                    set({ user: hydrateProfileImage(res.user), token: res.access_token, isLoading: false });
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'Login failed', isLoading: false });
                    throw err;
                }
            },

            signup: async (email, password, fullName, department) => {
                set({ isLoading: true, error: null });
                try {
                    await authApi.signup({ email, password, full_name: fullName, department });
                    set({ isLoading: false }); // Wait for OTP
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'Signup failed', isLoading: false });
                    throw err;
                }
            },

            verifySignup: async (email, otp) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await authApi.verifySignup({ email, otp });
                    set({ user: hydrateProfileImage(res.user), token: res.access_token, isLoading: false });
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'OTP verification failed', isLoading: false });
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

            googleAuth: async () => {
                set({ isLoading: true, error: null });
                try {
                    const res = await authApi.googleAuth();
                    if (res.url) {
                        window.location.href = res.url;
                    }
                } catch (err: unknown) {
                    set({ error: (err as Error).message || 'Google Auth failed', isLoading: false });
                    throw err;
                }
            },

            logout: () => {
                set({ user: null, token: null, error: null });
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
                    const nextUser = { ...current, ...updates };

                    if ('profileImage' in updates) {
                        persistProfileImageForEmail(nextUser.email, updates.profileImage ?? null);
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
