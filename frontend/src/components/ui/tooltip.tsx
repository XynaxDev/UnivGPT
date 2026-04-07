/* Copyright (c) 2026 XynaxDev
 * Contact: akashkumar.cs27@gmail.com
 */

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function HoverTooltip({
    content,
    children,
    followCursor = false,
    side = "top",
    align = "center",
    sideOffset = 10,
    className,
    delayDuration = 120,
}: {
    content?: React.ReactNode;
    children: React.ReactElement<any>;
    followCursor?: boolean;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    sideOffset?: number;
    className?: string;
    delayDuration?: number;
}) {
    if (!content) return children;
    const [tooltipEnabled, setTooltipEnabled] = React.useState(true);

    React.useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
        const sync = () => setTooltipEnabled(mediaQuery.matches);
        sync();
        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", sync);
            return () => mediaQuery.removeEventListener("change", sync);
        }
        mediaQuery.addListener(sync);
        return () => mediaQuery.removeListener(sync);
    }, []);

    if (!tooltipEnabled) return children;
    const tooltipBase =
        "z-[260] max-w-[320px] rounded-xl border border-orange-400/35 bg-gradient-to-b from-zinc-900/98 to-black/98 px-3 py-2 text-[11px] font-medium text-zinc-100 shadow-[0_18px_40px_rgba(0,0,0,0.62)] backdrop-blur-md";

    if (followCursor) {
        const [open, setOpen] = React.useState(false);
        const [position, setPosition] = React.useState({ x: 0, y: 0 });

        const childProps = children.props as Record<string, any>;
        const nextChild = React.cloneElement(children, {
            onMouseEnter: (event: React.MouseEvent) => {
                setOpen(true);
                setPosition({ x: event.clientX + 14, y: event.clientY + 18 });
                if (typeof childProps.onMouseEnter === "function") {
                    (childProps.onMouseEnter as (e: React.MouseEvent) => void)(event);
                }
            },
            onMouseMove: (event: React.MouseEvent) => {
                setPosition({ x: event.clientX + 14, y: event.clientY + 18 });
                if (typeof childProps.onMouseMove === "function") {
                    (childProps.onMouseMove as (e: React.MouseEvent) => void)(event);
                }
            },
            onMouseLeave: (event: React.MouseEvent) => {
                setOpen(false);
                if (typeof childProps.onMouseLeave === "function") {
                    (childProps.onMouseLeave as (e: React.MouseEvent) => void)(event);
                }
            },
        });

        return (
            <>
                {nextChild}
                {typeof document !== "undefined" &&
                    open &&
                    createPortal(
                        <div
                        className={cn(
                            "pointer-events-none fixed",
                            "animate-in fade-in-0 zoom-in-95 duration-150",
                            tooltipBase,
                            className,
                        )}
                            style={{ left: position.x, top: position.y }}
                        >
                            {content}
                        </div>,
                        document.body,
                    )}
            </>
        );
    }

    return (
        <TooltipPrimitive.Provider delayDuration={delayDuration}>
            <TooltipPrimitive.Root>
                <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
                <TooltipPrimitive.Portal>
                    <TooltipPrimitive.Content
                        side={side}
                        align={align}
                        sideOffset={sideOffset}
                        avoidCollisions
                        collisionPadding={12}
                        className={cn(
                            tooltipBase,
                            "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
                            "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
                            "data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95",
                            "data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1",
                            "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
                            className,
                        )}
                    >
                        {content}
                    </TooltipPrimitive.Content>
                </TooltipPrimitive.Portal>
            </TooltipPrimitive.Root>
        </TooltipPrimitive.Provider>
    );
}


