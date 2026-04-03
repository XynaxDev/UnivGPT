"use client";

import { cn } from "@/lib/utils";
import { NavLink, type NavLinkProps } from "react-router-dom";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrandLogo } from "./BrandLogo";
import { HoverTooltip } from "./tooltip";

interface Links {
    label: string;
    href: string;
    icon: React.JSX.Element | React.ReactNode;
}

const SidebarContext = createContext<{
    open: boolean;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    animate: boolean;
    hovered: boolean;
    setHovered: React.Dispatch<React.SetStateAction<boolean>>;
    isDesktop: boolean;
} | undefined>(undefined);

export const useSidebar = () => {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider");
    }
    return context;
};

export const SidebarProvider = ({
    children,
    open: openProp,
    setOpen: setOpenProp,
    animate = true,
}: {
    children: React.ReactNode;
    open?: boolean;
    setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
    animate?: boolean;
}) => {
    const [openState, setOpenState] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [isDesktop, setIsDesktop] = useState(true);

    React.useEffect(() => {
        const check = () => setIsDesktop(window.innerWidth > 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    const open = openProp !== undefined ? openProp : openState;
    const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

    return (
        <SidebarContext.Provider value={{ open, setOpen, animate, hovered, setHovered, isDesktop }}>
            {children}
        </SidebarContext.Provider>
    );
};

export const Sidebar = ({
    children,
    open,
    setOpen,
    animate,
}: {
    children: React.ReactNode;
    open?: boolean;
    setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
    animate?: boolean;
}) => {
    return (
        <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
            {children}
        </SidebarProvider>
    );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
    return (
        <>
            <DesktopSidebar {...props} />
            <MobileSidebar {...(props as any)} />
        </>
    );
};

export const DesktopSidebar = ({
    className,
    children,
    ...props
}: React.ComponentProps<typeof motion.div>) => {
    const { animate, hovered, setHovered } = useSidebar();
    return (
        <motion.div
            className={cn(
                "h-full flex flex-col bg-black flex-shrink-0 overflow-hidden hidden md:flex",
                className,
            )}
            animate={{
                width: animate ? (hovered ? "188px" : "72px") : "72px",
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            transition={{ duration: 0.2, ease: [0.2, 0.95, 0.2, 0.95] }}
            {...props}
        >
            {children}
        </motion.div>
    );
};

export const MobileSidebar = ({
    className,
    children,
}: React.ComponentProps<"div">) => {
    const { open, setOpen } = useSidebar();
    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[90] md:hidden"
                    />
                    <motion.div
                        initial={{ x: "-100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "-100%" }}
                        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                        className={cn(
                            "fixed h-full w-[80px] inset-y-0 left-0 bg-black border-r border-white/[0.05] p-4 z-[100] flex flex-col items-center",
                            className,
                        )}
                    >
                        <div className="flex flex-col h-full items-center gap-10">
                            <div className="mt-2">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-white/10">
                                    <BrandLogo className="w-6 h-6 text-black" />
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col gap-6 w-full items-center">{children}</div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export const SidebarLink = ({
    link,
    className,
    active,
    onClick,
    ...props
}: {
    link: Links;
    className?: string;
    active?: boolean;
    onClick?: () => void;
    props?: Omit<NavLinkProps, "to">;
}) => {
    const { setOpen, animate, hovered, setHovered, isDesktop } = useSidebar();
    const isExpanded = Boolean(hovered && isDesktop);
    const tooltipLabel = isDesktop && !isExpanded ? link.label : undefined;

    const handleClick = () => {
        if (!isDesktop) {
            setOpen(false);
            setHovered(false);
        }
        onClick?.();
    };

    const baseClasses =
        "flex items-center justify-start px-5.5 group/sidebar py-2.5 rounded-xl transition-all duration-200 w-full relative";
    const activeClasses = "text-orange-400";
    const inactiveClasses = "text-zinc-500 hover:text-white";

    if (onClick) {
        return (
            <HoverTooltip content={tooltipLabel} side="right" align="center">
                <button
                    onClick={handleClick}
                    className={cn(baseClasses, active ? activeClasses : inactiveClasses, className)}
                >
                    {link.icon}
                    <motion.span
                        initial={false}
                        animate={{
                            opacity: animate ? (isExpanded ? 1 : 0) : 1,
                            x: animate ? (isExpanded ? 0 : -8) : 0,
                            width: animate ? (isExpanded ? "auto" : 0) : "auto",
                        }}
                        className="text-[13px] font-medium transition duration-150 whitespace-nowrap ml-3 overflow-hidden"
                    >
                        {link.label}
                    </motion.span>
                </button>
            </HoverTooltip>
        );
    }

    return (
        <HoverTooltip content={tooltipLabel} side="right" align="center">
            <NavLink
                to={link.href}
                onClick={handleClick}
                className={cn(baseClasses, active ? activeClasses : inactiveClasses, className)}
                {...props}
            >
                {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-orange-500 rounded-r-full hidden md:block" />
                )}
                {link.icon}
                <motion.span
                    initial={false}
                    animate={{
                        opacity: animate ? (isExpanded ? 1 : 0) : 1,
                        x: animate ? (isExpanded ? 0 : -8) : 0,
                        width: animate ? (isExpanded ? "auto" : 0) : "auto",
                    }}
                    className="text-[13px] font-medium transition duration-150 whitespace-nowrap ml-3 overflow-hidden hidden md:inline-block"
                >
                    {link.label}
                </motion.span>
            </NavLink>
        </HoverTooltip>
    );
};
