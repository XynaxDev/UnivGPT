/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import React, { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useLocation } from 'react-router-dom';
import 'lenis/dist/lenis.css';

gsap.registerPlugin(ScrollTrigger);

function clearLenisArtifacts() {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const classes = ['lenis', 'lenis-smooth', 'lenis-stopped', 'lenis-scrolling', 'lenis-autoToggle'];
    classes.forEach((name) => {
        html.classList.remove(name);
        body.classList.remove(name);
    });
}

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
    const { pathname } = useLocation();

    useEffect(() => {
        const isTouchDevice =
            typeof window !== 'undefined' &&
            (
                window.matchMedia?.('(pointer: coarse)').matches ||
                navigator.maxTouchPoints > 0
            );

        // Dashboard and touch devices should always use native scrolling.
        if (pathname.startsWith('/dashboard') || isTouchDevice) {
            clearLenisArtifacts();
            return;
        }

        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            orientation: 'vertical',
            gestureOrientation: 'vertical',
            smoothWheel: true,
            wheelMultiplier: 1,
            touchMultiplier: 2,
            infinite: false,
        });

        // Sync Lenis scroll with GSAP ScrollTrigger
        lenis.on('scroll', ScrollTrigger.update);

        const raf = (time: number) => {
            lenis.raf(time * 1000);
        };

        gsap.ticker.add(raf);

        gsap.ticker.lagSmoothing(0);

        return () => {
            lenis.destroy();
            gsap.ticker.remove(raf);
            clearLenisArtifacts();
        };
    }, [pathname]);

    return <>{children}</>;
}


