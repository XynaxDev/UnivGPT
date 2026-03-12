import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { AuthUI, Label, Input, PasswordInput, Button, OTPInput } from '@/components/ui/auth-fuse';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { AnimatePresence } from 'framer-motion';
import { useToastStore } from '@/store/toastStore';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [view, setView] = useState<'login' | 'forgot' | 'otp' | 'reset'>('login');
    const { showToast } = useToastStore();
    const { login, forgotPassword, resetPassword, googleAuth, microsoftAuth, isLoading, error, clearError, token } = useAuthStore();
    const navigate = useNavigate();

    useEffect(() => {
        if (token) navigate('/dashboard');
    }, [token, navigate]);


    useEffect(() => {
        clearError();
    }, [clearError]);

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err: any) {
            showToast(err.message || "Invalid credentials.");
        }
    };

    const handleForgotSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await forgotPassword(email);
            setView('otp');
            showToast("Recovery email has been sent.", "success");
        } catch (err: any) {
            showToast(err.message || "Failed to send recovery email.");
        }
    };

    const handleOtpSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Simulate OTP verification
        if (otp.length === 6) {
            setView('reset');
        }
    };

    const handleResetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await resetPassword(email, otp, newPassword);
            showToast("Password updated successfully! Please sign in.", "success");
            setView('login');
            setPassword('');
            setOtp('');
            setNewPassword('');
        } catch (err: any) {
            showToast(err.message || "Error updating password.");
        }
    };

    const handleGoogleAuth = async () => {
        try {
            await googleAuth();
        } catch (err: any) {
            showToast(err.message || "Google authentication failed.");
        }
    };

    const handleMicrosoftAuth = async () => {
        try {
            await microsoftAuth();
        } catch (err: any) {
            showToast(err.message || "Microsoft authentication failed.");
        }
    };


    if (view === 'forgot') {
        return (
            <AuthUI isSignIn={true} onToggle={() => navigate('/auth/signup')} onGoogleClick={handleGoogleAuth} onMicrosoftClick={handleMicrosoftAuth}>
                <form onSubmit={handleForgotSubmit} className="flex flex-col gap-6">
                    <div className="flex flex-col items-center gap-2 text-center">
                        <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center mb-1 shadow-[0_0_20px_rgba(249,115,22,0.1)]">
                            <BrandLogo className="w-5 h-5 text-orange-400" />
                        </div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-white">Reset Password</h1>
                        <p className="text-sm text-zinc-500 max-w-[280px]">Enter your email to receive a recovery OTP</p>
                    </div>

                    <div className="grid gap-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="forgot-email" className="text-zinc-400 font-medium ml-1">Email</Label>
                            <Input
                                id="forgot-email"
                                type="email"
                                placeholder="you@university.edu"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            className="mt-2 h-11 text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-all rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                        >
                            Send OTP Code
                        </Button>
                        <button type="button" onClick={() => setView('login')} className="text-xs text-zinc-500 hover:text-white transition-colors mt-2">
                            Back to Sign In
                        </button>
                    </div>
                </form>
            </AuthUI>
        );
    }

    if (view === 'otp') {
        return (
            <AuthUI isSignIn={true} onToggle={() => navigate('/auth/signup')} onGoogleClick={handleGoogleAuth} onMicrosoftClick={handleMicrosoftAuth}>
                <form onSubmit={handleOtpSubmit} className="flex flex-col gap-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center mb-1 shadow-[0_0_20px_rgba(249,115,22,0.1)]">
                            <BrandLogo className="w-5 h-5 text-orange-400" />
                        </div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-white">Enter OTP</h1>
                        <div className="text-sm text-zinc-500 flex flex-col gap-1 items-center">
                            We sent a code to
                            <span className="text-white font-medium">{email}</span>
                        </div>
                    </div>

                    <div className="grid gap-6">
                        <div className="grid gap-2">
                            <Label htmlFor="reset-otp" className="text-zinc-400 font-medium ml-1">Secure OTP Code</Label>
                            <OTPInput value={otp} onChange={setOtp} />
                        </div>

                        <Button
                            type="submit"
                            className="mt-2 h-11 text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-all rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                            disabled={otp.length !== 6}
                        >
                            Verify Security Code
                        </Button>
                    </div>
                </form>
            </AuthUI>
        );
    }

    if (view === 'reset') {
        return (
            <AuthUI isSignIn={true} onToggle={() => navigate('/auth/signup')} onGoogleClick={handleGoogleAuth} onMicrosoftClick={handleMicrosoftAuth}>
                <form onSubmit={handleResetSubmit} className="flex flex-col gap-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center mb-1 shadow-[0_0_20px_rgba(249,115,22,0.1)]">
                            <BrandLogo className="w-5 h-5 text-orange-400" />
                        </div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-white">Create New Password</h1>
                        <div className="text-sm text-zinc-500 flex flex-col gap-1 items-center">
                            Set a strong secure phrase for your account
                        </div>
                    </div>

                    <div className="grid gap-6">
                        <PasswordInput
                            label="New Password"
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                        />

                        <Button
                            type="submit"
                            className="mt-2 h-11 text-sm font-bold bg-orange-600 hover:bg-orange-500 text-white transition-all rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.2)]"
                            disabled={newPassword.length < 6}
                        >
                            Reset Password & Sign In
                        </Button>
                    </div>
                </form>
            </AuthUI>
        );
    }

    return (
        <AuthUI
            isSignIn={true}
            onToggle={() => navigate('/auth/signup')}
            onGoogleClick={handleGoogleAuth}
            onMicrosoftClick={handleMicrosoftAuth}
        >
            <form onSubmit={handleLoginSubmit} autoComplete="on" className="flex flex-col gap-6">
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center mb-1 shadow-[0_0_20px_rgba(249,115,22,0.1)]">
                        <BrandLogo className="w-5 h-5 text-orange-400" />
                    </div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-white">Welcome Back</h1>
                    <p className="text-sm text-zinc-500 max-w-[280px]">Sign in to your UnivGPT account</p>
                </div>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 text-center font-medium"
                    >
                        {error}
                    </motion.div>
                )}

                <div className="grid gap-4">
                    <div className="grid gap-1.5">
                        <Label htmlFor="email" className="text-zinc-400 font-medium ml-1">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="you@university.edu"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-1">
                        <PasswordInput
                            label="Password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setView('forgot')}
                                className="text-[11px] font-medium text-zinc-500 hover:text-orange-400 transition-colors"
                            >
                                Forgot password?
                            </button>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        className="mt-2 h-11 text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-all rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                                Signing in...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </Button>
                </div>
            </form>
        </AuthUI>
    );
}
