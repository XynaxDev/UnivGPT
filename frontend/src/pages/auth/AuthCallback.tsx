/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';

const academicDomain = (import.meta.env.VITE_ACADEMIC_EMAIL_DOMAIN || '').toLowerCase();
const isAcademicEmail = (email?: string) => (email || '').trim().toLowerCase().endsWith(`@${academicDomain}`);
const ROLE_STORAGE_KEY = 'unigpt:pending-role';
const VALID_ROLES = new Set(['student', 'faculty', 'admin']);

const normalizeRole = (value?: string | null): 'student' | 'faculty' | 'admin' | null => {
    const role = (value || '').trim().toLowerCase();
    return VALID_ROLES.has(role) ? (role as 'student' | 'faculty' | 'admin') : null;
};

export default function AuthCallback() {
    const navigate = useNavigate();
    const { setSession, finishInitializing } = useAuthStore();

    useEffect(() => {
        const handleCallback = async () => {
            // Supabase handles the hash automatically
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error || !session) {
                console.error('OAuth callback error:', error);
                navigate('/auth/login?error=oauth_failed');
                return;
            }
            const urlRole = normalizeRole(new URLSearchParams(window.location.search).get('role'));
            const pendingRole = normalizeRole(window.localStorage.getItem(ROLE_STORAGE_KEY));
            const selectedRole = urlRole || pendingRole;

            try {
                if (selectedRole) {
                    try {
                        await authApi.setRole(session.access_token, selectedRole);
                    } catch (roleErr) {
                        console.warn('Role sync skipped:', roleErr);
                    }
                }
                // Sync with backend
                const user = await authApi.refreshMe(session.access_token);
                setSession(session.access_token, user);
                navigate('/dashboard');
            } catch (err) {
                console.warn('Backend sync failed in callback, using session metadata:', err);
                setSession(session.access_token, {
                    id: session.user.id,
                    email: session.user.email || '',
                    full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Google User',
                    role: selectedRole || (session.user.user_metadata?.role as any) || 'student',
                    academic_verified: isAcademicEmail(session.user.email || ''),
                    identity_provider: session.user.app_metadata?.provider || session.user.app_metadata?.providers?.[0] || 'email',
                });
                navigate('/dashboard');
            } finally {
                window.localStorage.removeItem(ROLE_STORAGE_KEY);
                finishInitializing();
            }
        };

        handleCallback();
    }, [navigate, setSession, finishInitializing]);

    return (
        <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center gap-4">
            <div className="relative">
                <div className="w-16 h-16 rounded-3xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center animate-pulse">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                </div>
                <div className="absolute -inset-4 bg-orange-500/5 blur-2xl rounded-full" />
            </div>
            <p className="text-zinc-500 font-medium animate-pulse">Completing authentication...</p>
        </div>
    );
}


