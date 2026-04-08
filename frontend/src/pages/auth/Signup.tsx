/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { AuthUI, Label, Input, PasswordInput, Button, OTPInput, Select } from '@/components/ui/auth-fuse';
import { Loader2, Shield, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useToastStore } from '@/store/toastStore';

type RoleOption = 'student' | 'faculty' | 'admin';
type SignupLocationState = {
    email?: string;
    password?: string;
    fullName?: string;
    selectedRole?: RoleOption;
    view?: 'signup' | 'otp';
};

export default function Signup() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [selectedRole, setSelectedRole] = useState<RoleOption>('student');
    const [otp, setOtp] = useState('');
    const [view, setView] = useState<'signup' | 'otp' | 'welcome'>('signup');
    const [resendCountdown, setResendCountdown] = useState(0);
    const { showToast } = useToastStore();
    const { signup, verifySignup, resendSignupOtp, googleAuth, isLoading, clearError, token } = useAuthStore();
    const navigate = useNavigate();
    const location = useLocation();

    React.useEffect(() => {
        const state = (location.state || {}) as SignupLocationState;
        if (!state || Object.keys(state).length === 0) return;
        if (state.email) setEmail(state.email);
        if (state.password) setPassword(state.password);
        if (state.fullName) setFullName(state.fullName);
        if (state.selectedRole) setSelectedRole(state.selectedRole);
        if (state.view) setView(state.view);
        navigate(location.pathname, { replace: true, state: null });
    }, [location.pathname, location.state, navigate]);

    React.useEffect(() => {
        if (token) navigate('/dashboard');
    }, [token, navigate]);


    const handleSignupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRole) {
            showToast('Please choose your role first.', 'error');
            return;
        }
        try {
            await signup(email, password, fullName, selectedRole);
            setView('otp');
            showToast("Verification email sent. Check your inbox for the code or secure link.", "success");
        } catch (err: any) {
            clearError();
            showToast(err.message || "Signup failed. Please try again.", 'error');
        }
    };

    const handleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await verifySignup(email, otp, password);
            setView('welcome');
        } catch (err: any) {
            clearError();
            showToast(err.message || "Invalid OTP code.", 'error');
        }
    };

    React.useEffect(() => {
        if (resendCountdown <= 0) return;
        const timer = window.setTimeout(() => setResendCountdown((prev) => prev - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [resendCountdown]);

    const handleResendOtp = async () => {
        if (!email) {
            showToast('Email missing for OTP resend.', 'error');
            return;
        }
        try {
            const message = await resendSignupOtp(email);
            showToast(message || 'Verification email resent successfully.', 'success');
            setResendCountdown(30);
        } catch (err: any) {
            clearError();
            showToast(err.message || 'Failed to resend OTP.', 'error');
        }
    };

    const handleGoogleAuth = async () => {
        if (!selectedRole) {
            showToast('Please choose your role before continuing with Google.', 'error');
            return;
        }
        try {
            window.localStorage.setItem('unigpt:pending-role', selectedRole);
            await googleAuth(selectedRole);
        } catch (err: any) {
            clearError();
            showToast(err.message || "Google authentication failed.", 'error');
        }
    };


    if (view === 'welcome') {
        return (
            <AuthUI isSignIn={false} onToggle={() => navigate('/auth/login')} onGoogleClick={handleGoogleAuth}>
                <div className="flex flex-col items-center gap-6 text-center py-6">
                    <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.15)]"
                    >
                        <BrandLogo className="w-10 h-10 text-emerald-400" />
                    </motion.div>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                            Welcome to{' '}
                            <span className="inline-block">
                                <span className="text-white">Univ</span>
                                <span className="text-orange-400">GPT</span>
                                !
                            </span>
                        </h1>
                        <p className="text-sm text-zinc-400 max-w-[280px] mx-auto leading-relaxed">
                            Your institutional identity has been verified. You're ready to explore an intelligent campus experience.
                        </p>
                    </div>
                    <Button
                        onClick={() => navigate('/dashboard')}
                        className="mt-4 h-11 px-8 text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-all rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)] w-full"
                    >
                        Continue to Dashboard
                    </Button>
                </div>
            </AuthUI>
        );
    }

    if (view === 'otp') {
        return (
            <AuthUI isSignIn={false} onToggle={() => navigate('/auth/login')} onGoogleClick={handleGoogleAuth}>
                <form onSubmit={handleOtpSubmit} className="flex flex-col gap-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-1 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                            <Shield className="w-5 h-5 text-emerald-400" />
                        </div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-white">Verify Email</h1>
                        <div className="text-sm text-zinc-500 flex flex-col gap-1 items-center">
                            We sent a verification email to
                            <span className="text-white font-medium">{email}</span>
                            <span className="text-xs text-zinc-500">Enter the code if one was provided, or use the secure link from the same email.</span>
                        </div>
                    </div>

                    <div className="grid gap-6">
                        <div className="grid gap-2">
                            <Label htmlFor="otp" className="text-zinc-400 font-medium ml-1">Secure OTP Code</Label>
                            <OTPInput value={otp} onChange={setOtp} />
                        </div>

                        <Button
                            type="submit"
                            className="mt-2 h-11 text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                            disabled={otp.length !== 6 || isLoading}
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> : null}
                            Verify & Proceed
                        </Button>
                        <div className="text-center">
                            <button
                                type="button"
                                onClick={handleResendOtp}
                                disabled={isLoading || resendCountdown > 0}
                                className="text-xs text-orange-300 hover:text-orange-200 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
                            >
                                {resendCountdown > 0 ? `Resend OTP in ${resendCountdown}s` : 'Resend OTP'}
                            </button>
                        </div>
                    </div>
                </form>
            </AuthUI>
        );
    }

    return (
        <AuthUI
            isSignIn={false}
            onToggle={() => navigate('/auth/login')}
            onGoogleClick={handleGoogleAuth}
        >
            <form onSubmit={handleSignupSubmit} autoComplete="on" className="flex flex-col gap-4">
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center mb-1 shadow-[0_0_20px_rgba(249,115,22,0.1)]">
                        <BrandLogo className="w-5 h-5 text-orange-400" />
                    </div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-white">Create Account</h1>
                    <p className="text-xs text-zinc-500 max-w-[300px]">
                        Get started with{' '}
                        <span className="text-zinc-300">Univ</span>
                        <span className="text-orange-400">GPT</span>
                        {' '}for free
                    </p>
                </div>

                <div className="grid gap-3">
                    <div className="grid gap-1">
                        <Label htmlFor="role" className="text-zinc-400 font-medium ml-1">Choose Role</Label>
                        <Select
                            id="role"
                            value={selectedRole}
                            onValueChange={(value) => setSelectedRole(value as RoleOption)}
                            placeholder="Select your role"
                            options={[
                                { value: "student", label: "Student" },
                                { value: "faculty", label: "Faculty" },
                                { value: "admin", label: "Admin" },
                            ]}
                        />
                    </div>

                    <div className="grid gap-1">
                        <Label htmlFor="fullName" className="text-zinc-400 font-medium ml-1">Full Name</Label>
                        <Input
                            id="fullName"
                            placeholder="Jane Doe"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                        />
                    </div>

                    <div className="grid gap-1">
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

                    <PasswordInput
                        label="Password"
                        placeholder="Create a password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    <div className="py-1 space-y-2 px-1">
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 group">
                            <div className="w-4 h-4 rounded-md bg-orange-500/10 border border-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                                <Zap className="w-3 h-3 text-orange-400" />
                            </div>
                            <span>AI-Powered Course Assistance</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 group">
                            <div className="w-4 h-4 rounded-md bg-orange-500/10 border border-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                                <Shield className="w-3 h-3 text-orange-400" />
                            </div>
                            <span>FERPA Compliant & Secure</span>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        className="mt-1 h-11 text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-all rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                        disabled={isLoading || !selectedRole}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                                Creating account...
                            </>
                        ) : (
                            'Create Account'
                        )}
                    </Button>
                </div>
            </form>
        </AuthUI>
    );
}


