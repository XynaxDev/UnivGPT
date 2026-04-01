import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
    GraduationCap, ArrowRight, Shield,
    Brain, BookOpen, Users, Zap, MessageSquare,
    FileText, Search, ChevronRight, ChevronLeft, Sparkles, BarChart3,
    Twitter, Linkedin, Github, Globe, Building2, School2, Library, BookCheck, Award, Plus, Minus, Star, User
} from 'lucide-react';
import { NavBar } from '@/components/ui/tubelight-navbar';
import { Sparkles as SparklesBg } from '@/components/ui/sparkles';
import { UpgradeBanner } from '@/components/ui/upgrade-banner';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuthStore } from '@/store/authStore';

const Marquee = ({ children, direction = "left", speed = 40 }: { children: React.ReactNode, direction?: "left" | "right", speed?: number }) => (
    <div className="flex overflow-hidden select-none gap-10 group">
        <div className={`flex shrink-0 justify-around min-w-full gap-10 animate-marquee ${direction === "right" ? "animate-reverse" : ""}`} style={{ animationDuration: `${speed}s` }}>
            {children}
            {children}
        </div>
        <div className={`flex shrink-0 justify-around min-w-full gap-10 animate-marquee ${direction === "right" ? "animate-reverse" : ""}`} aria-hidden="true" style={{ animationDuration: `${speed}s` }}>
            {children}
            {children}
        </div>
    </div>
);

gsap.registerPlugin(ScrollTrigger);

// Reusable animation variants
const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: (delay: number = 0) => ({
        opacity: 1, y: 0,
        transition: { duration: 0.6, delay, ease: [0.23, 1, 0.32, 1] as any }
    })
};

const staggerContainer: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } }
};

const staggerItem: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as any } }
};

const featureCards = [
    { icon: Brain, title: "Smart Course Advisor", desc: "Get instant conceptual breakdowns, study guides, and exam prep tailored to your exact curriculum.", color: "from-orange-500/20 to-orange-600/10", iconColor: "text-orange-400", borderColor: "border-orange-500/20 hover:border-orange-500/40" },
    { icon: Search, title: "Research Discovery", desc: "Search across thousands of indexed papers, theses, and faculty publications in natural language.", color: "from-amber-500/20 to-amber-600/10", iconColor: "text-amber-400", borderColor: "border-amber-500/20 hover:border-amber-500/40" },
    { icon: Shield, title: "FERPA Compliant", desc: "Enterprise-grade security with end-to-end encryption. Your academic data stays private, always.", color: "from-emerald-500/20 to-emerald-600/10", iconColor: "text-emerald-400", borderColor: "border-emerald-500/20 hover:border-emerald-500/40" },
    { icon: FileText, title: "Document Intelligence", desc: "Upload syllabi, handbooks, and policies. UnivGPT reads and understands them so you don't have to.", color: "from-orange-500/20 to-orange-600/10", iconColor: "text-orange-400", borderColor: "border-orange-500/20 hover:border-orange-500/40" },
    { icon: BarChart3, title: "Progress Analytics", desc: "Track your learning trajectory with visual dashboards and personalized improvement insights.", color: "from-rose-500/20 to-rose-600/10", iconColor: "text-rose-400", borderColor: "border-rose-500/20 hover:border-rose-500/40" },
    { icon: Users, title: "Faculty Dashboard", desc: "Dedicated tools for professors to manage resources, track engagement, and support students.", color: "from-amber-500/20 to-amber-600/10", iconColor: "text-amber-400", borderColor: "border-amber-500/20 hover:border-amber-500/40" },
];

const Landing = () => {
    const heroRef = useRef<HTMLDivElement>(null);
    const [activeTestimonial, setActiveTestimonial] = useState(0);
    const [openFaq, setOpenFaq] = useState<number | null>(0);

    const testimonials = [
        {
            quote: "UnivGPT changed how I study. Instead of spending hours digging through course portals, I just ask a question and get exactly what I need — with sources.",
            author: "Sarah Chen",
            role: "Computer Science, Class of 2026"
        },
        {
            quote: "As a faculty member, this platform has dramatically reduced repetitive questions. My students find syllabus answers instantly, letting me focus on actual teaching.",
            author: "Dr. James Miller",
            role: "Professor of Physics"
        },
        {
            quote: "The ability to search across all departmental research papers using natural language is a game changer for my thesis literature review.",
            author: "Elena Rodriguez",
            role: "PhD Candidate"
        }
    ];

    const faqs = [
        {
            q: "How does UnivGPT connect to my university?",
            a: "We integrate directly via secure APIs compatible with Canvas, Moodle, and Blackboard. You simply log in with your .edu email and we handle the institutional authentication and data syncing automatically."
        },
        {
            q: "Is my academic data secure and private?",
            a: "Absolutely. We are fully FERPA compliant. All interactions are end-to-end encrypted, and your query data is never used to train global AI models. Your data remains siloed to your specific institutional node."
        },
        {
            q: "Can I upload my own study materials?",
            a: "Yes! Students can upload personal PDFs, notes, and past assignments to create a private knowledge base that UnivGPT can reference alongside official university resources."
        },
        {
            q: "Does it work for specific major requirements?",
            a: "Yes, our system ingests your university's entire course catalog, prerequisite chains, and graduation requirements to provide precise academic advising."
        }
    ];

    const nextTestimonial = () => setActiveTestimonial((p) => (p + 1) % testimonials.length);
    const prevTestimonial = () => setActiveTestimonial((p) => (p - 1 + testimonials.length) % testimonials.length);

    useEffect(() => {
        gsap.to(".hero-parallax", {
            y: -60,
            opacity: 0,
            scrollTrigger: {
                trigger: heroRef.current,
                start: "center center",
                end: "bottom top",
                scrub: true,
            }
        });

        let lastY = 0;
        const header = document.querySelector('.site-header') as HTMLElement | null;
        const onScroll = () => {
            const y = window.pageYOffset || document.documentElement.scrollTop;
            if (y > 80) {
                header?.classList.add('header-scrolled');
            } else {
                header?.classList.remove('header-scrolled');
            }
            if (y > 300 && y > lastY) {
                header?.classList.add('nav-hidden');
            } else {
                header?.classList.remove('nav-hidden');
            }
            lastY = y;
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const { user } = useAuthStore();

    return (
        <div id="top" className="min-h-screen bg-black text-white overflow-x-hidden">
            {/* ═══════════════════ HEADER ═══════════════════ */}
            <header className="site-header fixed top-0 w-full z-[100] transition-all duration-300 bg-transparent">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3 group shrink-0">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center transition-transform shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                            <BrandLogo className="text-black w-5 h-5" />
                        </div>
                        <span className="text-2xl font-black tracking-tighter" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>
                            <span className="text-white">Univ</span>
                            <span className="text-orange-400">GPT</span>
                        </span>
                    </Link>

                    {/* Centered Nav Pill */}
                    <div className="hidden md:flex absolute left-1/2 -translate-x-1/2">
                        <NavBar items={[
                            { name: 'Home', url: '#top', icon: BrandLogo },
                            { name: 'Features', url: '#features', icon: Zap },
                            { name: 'How it Works', url: '#how-it-works', icon: BookOpen },
                        ]} />
                    </div>

                    <div className="flex items-center gap-6 shrink-0">
                        {user ? (
                            <Link to="/dashboard">
                                <Button className="rounded-full px-6 h-10 bg-white hover:bg-zinc-200 text-black text-sm font-semibold border-0 shadow-lg transition-transform hover:scale-105">
                                    Dashboard
                                </Button>
                            </Link>
                        ) : (
                            <>
                                <Link to="/auth/login" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium hidden sm:inline">
                                    Sign in
                                </Link>
                                <Link to="/auth/signup">
                                    <Button className="rounded-full px-6 h-10 bg-white hover:bg-zinc-200 text-black text-sm font-semibold border-0 shadow-lg transition-transform hover:scale-105">
                                        Get Started
                                    </Button>
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <style>{`
                @keyframes marquee {
                    from { transform: translateX(0); }
                    to { transform: translateX(-100%); }
                }
                .animate-marquee {
                    animation: marquee linear infinite;
                }
                .animate-reverse {
                    animation-direction: reverse;
                }
                .site-header.nav-hidden {
                    transform: translateY(-100%);
                }
                .text-gradient {
                    background: linear-gradient(to right, #fb923c, #f59e0b, #ef4444);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .bg-mesh {
                    background-image: 
                        radial-gradient(at 0% 0%, hsla(20,100%,7%,1) 0, transparent 50%), 
                        radial-gradient(at 50% 0%, hsla(30,100%,15%,1) 0, transparent 50%), 
                        radial-gradient(at 100% 0%, hsla(10,100%,15%,1) 0, transparent 50%);
                }
                @keyframes float {
                    0% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(30px, -50px) scale(1.1); }
                    66% { transform: translate(-20px, 20px) scale(0.9); }
                    100% { transform: translate(0, 0) scale(1); }
                }
                .animate-float {
                    animation: float 20s ease-in-out infinite;
                }
            `}</style>

            <main>
                {/* ═══════════════════ HERO ═══════════════════ */}
                <section ref={heroRef} className="relative min-h-[90vh] flex items-center justify-center px-6 pt-20 overflow-hidden">
                    <div className="absolute inset-0 bg-black z-0">
                        {/* Premium Dynamic Glows - Orange Theme */}
                        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-orange-600/20 rounded-full blur-[120px] animate-float" />
                        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-600/20 rounded-full blur-[120px] animate-float" style={{ animationDelay: '-5s' }} />
                        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-red-600/10 rounded-full blur-[100px] animate-float" style={{ animationDelay: '-10s' }} />

                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black" />
                    </div>

                    <div className="hero-parallax relative z-10 max-w-4xl mx-auto text-center">
                        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0} className="mb-8">
                            <UpgradeBanner
                                buttonText="Explore Premium"
                                description="Introducing UnivGPT Advanced Analytics"
                            />
                        </motion.div>

                        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.1} className="mb-6">
                            <Badge className="bg-orange-500/10 hover:bg-orange-500/15 text-orange-400 border border-orange-500/20 px-4 py-1.5 text-xs font-bold tracking-widest uppercase transition-colors">
                                <Sparkles className="w-3.5 h-3.5 mr-2 text-orange-400 inline shadow-glow" />
                                AI-Powered Academic Intelligence
                            </Badge>
                        </motion.div>

                        <motion.h1
                            variants={fadeUp} initial="hidden" animate="visible" custom={0.1}
                            className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6"
                        >
                            Your University,{' '}
                            <span className="text-gradient">One Conversation Away</span>
                        </motion.h1>

                        <motion.p
                            variants={fadeUp} initial="hidden" animate="visible" custom={0.2}
                            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed"
                        >
                            UnivGPT connects students and faculty with institutional knowledge —
                            course materials, policies, research papers — all through a single intelligent assistant.
                        </motion.p>

                        <motion.div
                            variants={fadeUp} initial="hidden" animate="visible" custom={0.3}
                            className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6"
                        >
                            {user ? (
                                <>
                                    <Link to="/dashboard" className="w-full sm:w-auto">
                                        <Button className="w-full sm:w-auto rounded-full px-10 h-14 bg-orange-600 hover:bg-orange-500 hover:scale-105 active:scale-95 text-white text-sm font-bold transition-all duration-300 group border-0 shadow-[0_0_30px_rgba(234,88,12,0.3)]">
                                            Go to Dashboard
                                            <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                                        </Button>
                                    </Link>
                                    <Link to="/dashboard/chat" className="w-full sm:w-auto">
                                        <Button className="w-full sm:w-auto rounded-full px-10 h-14 bg-white/5 hover:bg-white/10 hover:scale-105 active:scale-95 text-white text-sm font-bold transition-all duration-300 group border border-white/10 backdrop-blur-sm">
                                            Open Chat
                                            <Sparkles className="ml-2 w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
                                        </Button>
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link to="/auth/signup" className="w-full sm:w-auto">
                                        <Button className="w-full sm:w-auto rounded-full px-10 h-14 bg-orange-600 hover:bg-orange-500 hover:scale-105 active:scale-95 text-white text-sm font-bold transition-all duration-300 group border-0 shadow-[0_0_30px_rgba(234,88,12,0.3)]">
                                            Start for Free
                                            <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                                        </Button>
                                    </Link>
                                    <Link to="/auth/login" className="w-full sm:w-auto">
                                        <Button className="w-full sm:w-auto rounded-full px-10 h-14 bg-white hover:bg-zinc-100 hover:scale-105 active:scale-95 text-black text-sm font-bold transition-all duration-300 group border-0 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                                            Open Chat
                                            <Sparkles className="ml-2 w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
                                        </Button>
                                    </Link>
                                </>
                            )}
                        </motion.div>
                    </div>

                </section>

                {/* ═══════════════════ SOCIAL PROOF ═══════════════════ */}
                <motion.section
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="py-24 bg-black"
                >
                    <div className="max-w-7xl mx-auto px-6">
                        <p className="text-center text-xs uppercase tracking-[0.3em] text-zinc-600 mb-16 font-bold">Trusted by leading academic institutions</p>
                        <Marquee speed={40}>
                            {[
                                { name: 'Stanford', icon: School2 },
                                { name: 'MIT', icon: Building2 },
                                { name: 'Harvard', icon: Library },
                                { name: 'Oxford', icon: BookCheck },
                                { name: 'Berkeley', icon: Award },
                                { name: 'Cambridge', icon: School2 },
                                { name: 'Princeton', icon: Building2 },
                                { name: 'ETH Zurich', icon: Library }
                            ].map(uni => (
                                <div key={uni.name} className="flex items-center gap-5 px-10 grayscale hover:grayscale-0 transition-all cursor-default group">
                                    <uni.icon className="w-6 h-6 text-zinc-500 group-hover:text-orange-500 transition-colors" />
                                    <span className="text-xl font-bold tracking-tight text-white/40 group-hover:text-white transition-colors uppercase whitespace-nowrap" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>{uni.name}</span>
                                </div>
                            ))}
                        </Marquee>
                    </div>
                </motion.section>

                {/* ═══════════════════ FEATURES ═══════════════════ */}
                <section id="features" className="py-32 px-6 bg-black relative">

                    <div className="max-w-7xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-80px" }}
                            transition={{ duration: 0.6 }}
                            className="text-center mb-20"
                        >
                            <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-4 py-1.5 text-xs font-bold tracking-widest uppercase mb-6 inline-flex">
                                Everything you need
                            </Badge>
                            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
                                Built for the modern campus
                            </h2>
                            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                                From course guidance to research — UnivGPT is the single platform
                                that understands your entire university ecosystem.
                            </p>
                        </motion.div>

                        <motion.div
                            variants={staggerContainer}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: "-60px" }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                            {featureCards.map((f, i) => (
                                <motion.div key={i} variants={staggerItem} className="h-full">
                                    <Card className={`p-8 group h-full flex flex-col cursor-default bg-black/40 border ${f.borderColor} transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}>
                                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110 shrink-0`}>
                                            <f.icon className={`w-5 h-5 ${f.iconColor}`} />
                                        </div>
                                        <h3 className="text-lg font-semibold mb-2 text-white">{f.title}</h3>
                                        <p className="text-sm text-zinc-400 leading-relaxed font-medium not-italic flex-grow">{f.desc}</p>
                                    </Card>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </section>

                {/* ═══════════════════ ECOSYSTEM ═══════════════════ */}
                <section className="py-32 px-6 bg-black">
                    <div className="max-w-7xl mx-auto">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                            >
                                <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-4 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase mb-8">
                                    Full Integration
                                </Badge>
                                <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-8 leading-[1.1]">
                                    An academic ecosystem that <span className="text-gradient">works for you.</span>
                                </h2>
                                <p className="text-xl text-zinc-400 mb-12 leading-relaxed">
                                    UnivGPT isn't just a chatbot. It's an intelligent layer that sits on top of your existing university infrastructure, making every piece of data actionable.
                                </p>

                                <div className="space-y-6">
                                    {[
                                        { title: "Direct Canvas/Moodle Integration", desc: "Sync your courses, assignments, and grades automatically." },
                                        { title: "Digital Library Access", desc: "Search and summarize institutional repository documents in real-time." },
                                        { title: "Campus-Wide Knowledge Base", desc: "Access the most up-to-date university policies, handbooks, and FAQs." }
                                    ].map((item, i) => (
                                        <div key={i} className="flex gap-5 group">
                                            <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0 mt-1 transition-colors group-hover:bg-orange-500/40">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-white font-bold mb-1">{item.title}</h4>
                                                <p className="text-zinc-500 text-sm leading-relaxed">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                                className="relative"
                            >
                                <div className="relative aspect-video lg:aspect-square rounded-[3rem] bg-zinc-950 border border-white/5 overflow-hidden group shadow-2xl">
                                    <img
                                        src="/academic_integration_illustration.png"
                                        alt="Academic Ecosystem"
                                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />

                                    {/* Floating Stats over image */}
                                    <div className="absolute bottom-8 left-8 right-8 grid grid-cols-2 gap-4">
                                        {[
                                            { label: "Uptime", val: "99.9%" },
                                            { label: "Sync Speed", val: "< 50ms" }
                                        ].map((s, i) => (
                                            <div key={i} className="glass-card p-4 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10">
                                                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{s.label}</div>
                                                <div className="text-white font-bold">{s.val}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* ═══════════════════ HOW IT WORKS ═══════════════════ */}

                <section id="how-it-works" className="py-40 px-6 bg-black relative overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[600px] bg-orange-600/5 rounded-full blur-[160px] pointer-events-none" />

                    <div className="max-w-6xl mx-auto relative z-10">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6 }}
                            className="text-center mb-24"
                        >
                            <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-4 py-1.5 text-[10px] font-bold tracking-[0.3em] uppercase mb-8 inline-flex">
                                The Journey
                            </Badge>
                            <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">
                                Simple to start. <span className="text-zinc-500">Powerful to use.</span>
                            </h2>
                            <p className="text-zinc-500 max-w-xl mx-auto text-lg leading-relaxed">
                                We've streamlined the onboarding process so you can focus on what matters most: learning.
                            </p>
                        </motion.div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                            {[
                                {
                                    step: "01", col: "md:col-span-2", title: "Verify University Identity",
                                    desc: "Just use your .edu email. Our system instantly recognizes your institution's specific portal and protocols. No cumbersome setups.",
                                    color: "from-orange-500/20 to-amber-500/5", glow: "text-orange-500",
                                    icon: Building2
                                },
                                {
                                    step: "02", col: "md:col-span-1", title: "Query Institutional Alpha",
                                    desc: "Ask about anything from obscure library archives to current campus policy in natural language.",
                                    color: "from-amber-500/20 to-red-500/5", glow: "text-amber-500",
                                    icon: MessageSquare
                                },
                                {
                                    step: "03", col: "md:col-span-1", title: "Command Verified Insights",
                                    desc: "Get answers with pinpoint citations from your university's real database.",
                                    color: "from-red-500/20 to-rose-600/5", glow: "text-red-500",
                                    icon: Shield
                                },
                            ].map((item, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1, duration: 0.6 }}
                                    className={`group relative flex flex-col justify-between p-10 md:p-12 rounded-[2.5rem] bg-zinc-950/40 border border-white/5 hover:border-white/10 hover:bg-zinc-950/80 transition-all duration-500 ${item.col} overflow-hidden`}
                                >
                                    <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl ${item.color} blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />

                                    <div className="relative z-10">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className={`w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center`}>
                                                <item.icon className={`w-6 h-6 ${item.glow}`} />
                                            </div>
                                            <span className="text-5xl font-black text-white/5 group-hover:text-white/10 transition-colors uppercase tracking-tighter">
                                                {item.step}
                                            </span>
                                        </div>
                                        <h3 className="text-2xl font-bold mb-4 text-white group-hover:text-orange-400 transition-colors tracking-tight">{item.title}</h3>
                                        <p className="text-zinc-500 leading-relaxed font-medium transition-colors group-hover:text-zinc-400 max-w-sm">{item.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ═══════════════════ STATS ═══════════════════ */}
                <section className="py-24 px-6 bg-transparent relative z-10 w-full flex flex-col items-center">
                    <div className="max-w-5xl mx-auto w-full">
                        <div className="text-center mb-16">
                            <blockquote className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight mx-auto max-w-3xl" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                                "Unlock the future of academic intelligence with UnivGPT."
                            </blockquote>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                            {[
                                { value: "50K+", label: "Documents Indexed", color: "from-orange-400 to-amber-500" },
                                { value: "12K+", label: "Active Students", color: "from-amber-400 to-yellow-500" },
                                { value: "98.4%", label: "Answer Accuracy", color: "from-emerald-400 to-teal-500" },
                                { value: "< 2s", label: "Avg. Response", color: "from-blue-400 to-indigo-500" },
                            ].map((stat, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 16 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1, duration: 0.5 }}
                                    className="p-8 rounded-3xl bg-zinc-950/40 border border-white/5"
                                >
                                    <div className={`text-4xl md:text-5xl font-extrabold tracking-tight mb-3 bg-gradient-to-br ${stat.color} bg-clip-text text-transparent drop-shadow-sm`}>{stat.value}</div>
                                    <div className="text-sm font-medium text-zinc-500">{stat.label}</div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ═══════════════════ TESTIMONIALS CAROUSEL ═══════════════════ */}
                <section className="py-32 px-6 bg-black relative overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-amber-600/5 rounded-full blur-[120px] pointer-events-none" />

                    <div className="max-w-4xl mx-auto relative z-10 w-full">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6 }}
                            className="text-center mb-16"
                        >
                            <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-4 py-1.5 text-[10px] font-bold tracking-[0.3em] uppercase mb-6 inline-flex">
                                Voices
                            </Badge>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight">
                                Trusted by the best
                            </h2>
                        </motion.div>

                        <div className="relative">
                            <div className="overflow-hidden py-8 -my-8 px-2 -mx-2">
                                <motion.div
                                    className="flex transition-transform duration-500 ease-in-out"
                                    style={{ transform: `translateX(-${activeTestimonial * 100}%)` }}
                                >
                                    {testimonials.map((t, i) => (
                                        <div key={i} className="w-full shrink-0 px-4">
                                            <div className="glass-card p-12 md:p-16 text-center h-full flex flex-col justify-center items-center relative overflow-hidden group hover:-translate-y-1 transition-transform border-white/5">
                                                <div className="flex gap-1 mb-8">
                                                    {[...Array(5)].map((_, idx) => (
                                                        <Star key={idx} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                                                    ))}
                                                </div>
                                                <blockquote className="text-2xl md:text-3xl font-medium tracking-tight leading-snug mb-10 text-white/90">
                                                    "{t.quote}"
                                                </blockquote>
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-full border border-white/10 shrink-0 overflow-hidden bg-zinc-800">
                                                        <img src={`https://i.pravatar.cc/150?u=${t.author.replace(/\s+/g, '')}`} alt={t.author} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="text-left border-l border-white/10 pl-4">
                                                        <div className="font-bold text-lg text-white">{t.author}</div>
                                                        <div className="text-sm font-medium text-orange-400/80 tracking-wide mt-0.5">{t.role}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </motion.div>
                            </div>

                            {/* Carousel Controls */}
                            <div className="flex justify-center items-center gap-6 mt-10">
                                <button onClick={prevTestimonial} className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <div className="flex gap-3">
                                    {testimonials.map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setActiveTestimonial(i)}
                                            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${activeTestimonial === i ? 'bg-orange-500 w-8' : 'bg-white/20 hover:bg-white/40'}`}
                                        />
                                    ))}
                                </div>
                                <button onClick={nextTestimonial} className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all">
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ═══════════════════ FAQ SECTION ═══════════════════ */}
                <section className="py-32 px-6 bg-black relative z-10">
                    <div className="max-w-3xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6 }}
                            className="text-center mb-16"
                        >
                            <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-4 py-1.5 text-[10px] font-bold tracking-[0.3em] uppercase mb-6 inline-flex">
                                Questions
                            </Badge>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
                                Frequently Asked Questions
                            </h2>
                            <p className="text-zinc-500 text-lg">
                                Everything you need to know about the platform and how it works.
                            </p>
                        </motion.div>

                        <div className="space-y-4">
                            {faqs.map((faq, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1, duration: 0.5 }}
                                    className="border border-white/5 bg-black/50 rounded-2xl overflow-hidden transition-all duration-300"
                                >
                                    <button
                                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                        className="w-full px-8 py-6 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                                    >
                                        <span className={`font-bold text-lg transition-colors duration-300 ${openFaq === i ? 'text-orange-400' : 'text-white'}`}>
                                            {faq.q}
                                        </span>
                                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-all duration-300 ${openFaq === i ? 'border-orange-500/50 bg-orange-500/10 text-orange-400' : 'border-white/10 bg-transparent text-white/50'}`}>
                                            {openFaq === i ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                        </div>
                                    </button>
                                    <div
                                        className={`px-8 overflow-hidden transition-all duration-300 ease-in-out ${openFaq === i ? 'max-h-48 pb-6 opacity-100' : 'max-h-0 opacity-0'}`}
                                    >
                                        <p className="text-zinc-400 leading-relaxed">
                                            {faq.a}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ═══════════════════ CTA ═══════════════════ */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="py-32 px-6 bg-black relative"
                >
                    <div className="max-w-4xl mx-auto text-center relative z-10">
                        {/* Gradient border card matching the screenshot perfectly */}
                        <div className="rounded-[2.5rem] p-[1px] bg-gradient-to-br from-orange-500/40 via-transparent to-orange-500/10 shadow-[0_0_80px_rgba(249,115,22,0.1)]">
                            <div className="rounded-[2.5rem] bg-[#0A0A0A] p-16 md:p-24 relative overflow-hidden">
                                {/* Subtle inner glow for the CTA */}
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[50%] bg-orange-600/10 rounded-[100%] blur-[80px]" />

                                <h2 className="text-5xl md:text-6xl font-black tracking-tight mb-8 relative z-10">
                                    Ready to transform your<br />campus experience?
                                </h2>
                                <p className="text-lg text-zinc-400 mb-12 max-w-xl mx-auto leading-relaxed relative z-10">
                                    Join thousands of students and faculty already using UnivGPT to navigate university life smarter.
                                </p>
                                {user ? (
                                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
                                        <Link to="/dashboard">
                                            <Button className="rounded-full px-10 h-14 bg-white hover:bg-zinc-200 hover:scale-105 active:scale-95 text-black text-sm font-bold transition-all duration-300 shadow-2xl border-0 group flex items-center">
                                                Go to Dashboard
                                                <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                                            </Button>
                                        </Link>
                                        <Link to="/dashboard/chat">
                                            <Button className="rounded-full px-10 h-14 bg-white/5 hover:bg-white/10 hover:scale-105 active:scale-95 text-white text-sm font-bold transition-all duration-300 shadow-xl border border-white/10 group flex items-center">
                                                Open Chat
                                                <Sparkles className="ml-2 w-4 h-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                                            </Button>
                                        </Link>
                                    </div>
                                ) : (
                                    <Link to="/auth/signup">
                                        <Button className="rounded-full px-10 h-14 bg-white hover:bg-zinc-200 hover:scale-105 active:scale-95 text-black text-sm font-bold transition-all duration-300 shadow-2xl relative z-10 w-fit mx-auto border-0 group flex items-center">
                                            Create Free Account
                                            <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.section>
            </main>

            {/* ═══════════════════ FOOTER ═══════════════════ */}
            <footer className="bg-black pt-32 pb-16 px-6 relative overflow-hidden">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-600/5 rounded-full blur-[128px]" />
                <div className="max-w-7xl mx-auto relative z-10">
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-16 mb-24">
                        <div className="col-span-2 md:col-span-4">
                            <Link to="/" className="flex items-center gap-3 mb-8 group">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-105">
                                    <BrandLogo className="text-black w-6 h-6" />
                                </div>
                                <span className="text-3xl font-black tracking-tighter text-white" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>
                                    <span className="text-white">Univ</span>
                                    <span className="text-orange-400">GPT</span>
                                </span>
                            </Link>
                            <p className="text-zinc-500 max-w-sm text-lg leading-relaxed mb-10">
                                The intelligent academic platform that bridges institutional knowledge and student success.
                            </p>
                            <div className="flex gap-4">
                                {[Twitter, Github, Linkedin, Globe].map((Icon, i) => (
                                    <a key={i} href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-orange-500 hover:border-orange-500/50 transition-all">
                                        <Icon className="w-5 h-5" />
                                    </a>
                                ))}
                            </div>
                        </div>

                        <div className="col-span-2 md:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-12">
                            {[
                                { title: "Product", links: ["Features", "Pricing", "Integrations", "API", "Changelog"] },
                                { title: "Resources", links: ["Documentation", "Community", "Support", "University Partners", "Status"] },
                                { title: "Legal", links: ["Privacy Policy", "Terms of Service", "Security", "FERPA Compliance", "GDPR"] }
                            ].map((col, idx) => (
                                <div key={idx}>
                                    <h4 className="text-white font-bold mb-8 uppercase tracking-[0.2em] text-[10px]">{col.title}</h4>
                                    <ul className="space-y-4">
                                        {col.links.map(link => (
                                            <li key={link}>
                                                <a href="#" className="text-zinc-500 hover:text-white transition-colors text-sm font-medium">{link}</a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-10">
                        <p className="text-zinc-600 text-sm font-medium">© 2026 UnivGPT. Crafted for academics worldwide.</p>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/5 rounded-full border border-emerald-500/10">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-emerald-500/80 text-[10px] font-bold uppercase tracking-widest">All systems operational</span>
                            </div>
                            <div className="w-[1px] h-4 bg-zinc-800" />
                            <a href="#" className="text-zinc-500 hover:text-white text-xs transition-colors">English (US)</a>
                        </div>
                    </div>
                </div>
            </footer>


        </div>
    );
};

export default Landing;
