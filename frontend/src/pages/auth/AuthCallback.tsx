import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';

const academicDomain = (import.meta.env.VITE_ACADEMIC_EMAIL_DOMAIN || 'krmu.edu.in').toLowerCase();
const isAcademicEmail = (email?: string) => (email || '').trim().toLowerCase().endsWith(`@${academicDomain}`);

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

            try {
                // Sync with backend
                const user = await authApi.getMe(session.access_token);
                setSession(session.access_token, user);
                navigate('/dashboard');
            } catch (err) {
                console.warn('Backend sync failed in callback, using session metadata:', err);
                setSession(session.access_token, {
                    id: session.user.id,
                    email: session.user.email || '',
                    full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Google User',
                    role: (session.user.user_metadata?.role as any) || 'student',
                    academic_verified: isAcademicEmail(session.user.email || ''),
                    identity_provider: session.user.app_metadata?.provider || session.user.app_metadata?.providers?.[0] || 'email',
                });
                navigate('/dashboard');
            } finally {
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
