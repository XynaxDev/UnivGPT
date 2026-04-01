import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-semibold tracking-normal transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default:
                    "border border-primary/40 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:border-primary/60 hover:scale-[1.02] active:scale-[0.98]",
                destructive:
                    "border border-transparent bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:border-destructive/60",
                outline:
                    "border border-white/15 bg-white/[0.03] backdrop-blur-md shadow-sm hover:bg-white/[0.06] hover:border-white/25 text-zinc-200",
                secondary:
                    "border border-transparent bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:border-secondary/40",
                ghost: "border border-transparent hover:bg-primary/10 hover:text-primary hover:border-primary/25",
                link: "text-primary underline-offset-4 hover:underline normal-case tracking-normal",
                premium: "bg-foreground text-background shadow-2xl hover:bg-foreground/90 hover:-translate-y-0.5 active:translate-y-0 transition-transform duration-200",
                glass: "bg-white/5 backdrop-blur-md border border-white/12 text-foreground hover:bg-white/10 hover:border-white/20",
                neon: "bg-primary/10 border border-primary/20 text-primary shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-primary/20 hover:border-primary/35"
            },
            size: {
                default: "h-11 px-6 py-2",
                sm: "h-9 rounded-lg px-4 text-[10px]",
                lg: "h-14 rounded-xl px-10 text-md",
                xl: "h-16 rounded-2xl px-12 text-base",
                icon: "h-11 w-11 rounded-xl",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button, buttonVariants };
