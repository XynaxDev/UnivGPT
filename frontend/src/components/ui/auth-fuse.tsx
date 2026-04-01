"use client";

import * as React from "react";
import { useState, useId, useEffect } from "react";
import { Slot } from "@radix-ui/react-slot";
import * as LabelPrimitive from "@radix-ui/react-label";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, Eye, EyeOff } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/ui/BrandLogo";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface TypewriterProps {
    text: string | string[];
    speed?: number;
    cursor?: string;
    loop?: boolean;
    deleteSpeed?: number;
    delay?: number;
    className?: string;
}

export function Typewriter({
    text,
    speed = 100,
    cursor = "|",
    loop = false,
    deleteSpeed = 50,
    delay = 1500,
    className,
}: TypewriterProps) {
    const [displayText, setDisplayText] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [textArrayIndex, setTextArrayIndex] = useState(0);

    const textArray = Array.isArray(text) ? text : [text];
    const currentText = textArray[textArrayIndex] || "";

    useEffect(() => {
        if (!currentText) return;

        const timeout = setTimeout(
            () => {
                if (!isDeleting) {
                    if (currentIndex < currentText.length) {
                        setDisplayText((prev) => prev + currentText[currentIndex]);
                        setCurrentIndex((prev) => prev + 1);
                    } else if (loop) {
                        setTimeout(() => setIsDeleting(true), delay);
                    }
                } else {
                    if (displayText.length > 0) {
                        setDisplayText((prev) => prev.slice(0, -1));
                    } else {
                        setIsDeleting(false);
                        setCurrentIndex(0);
                        setTextArrayIndex((prev) => (prev + 1) % textArray.length);
                    }
                }
            },
            isDeleting ? deleteSpeed : speed,
        );

        return () => clearTimeout(timeout);
    }, [
        currentIndex,
        isDeleting,
        currentText,
        loop,
        speed,
        deleteSpeed,
        delay,
        displayText,
        text,
    ]);

    return (
        <span className={className}>
            {displayText}
            <span className="animate-pulse">{cursor}</span>
        </span>
    );
}

const labelVariants = cva(
    "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
    React.ElementRef<typeof LabelPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
    <LabelPrimitive.Root
        ref={ref}
        className={cn(labelVariants(), className)}
        {...props}
    />
));
Label.displayName = LabelPrimitive.Root.displayName;

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground hover:bg-primary/90",
                destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                outline: "border border-white/10 dark:border-white/10 bg-white/5 hover:bg-white/10 hover:text-white",
                secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                ghost: "hover:bg-accent hover:text-accent-foreground",
                link: "text-white/60 underline-offset-4 hover:underline hover:text-white",
            },
            size: {
                default: "h-11 px-4 py-2",
                sm: "h-9 rounded-md px-3",
                lg: "h-12 rounded-md px-6",
                icon: "h-8 w-8",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";
        return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
    }
);
Button.displayName = "Button";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm ring-offset-black transition-all placeholder:text-zinc-500 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50",
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Input.displayName = "Input";

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface SelectProps {
    id?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    options: SelectOption[];
    disabled?: boolean;
    className?: string;
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
    (
        {
            id,
            value,
            onValueChange,
            placeholder = "Select an option",
            options,
            disabled = false,
            className,
        },
        ref
    ) => {
        return (
            <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
                <SelectPrimitive.Trigger
                    ref={ref}
                    id={id}
                    className={cn(
                        "flex h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white shadow-sm ring-offset-black transition-all data-[placeholder]:text-zinc-500 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50",
                        className
                    )}
                >
                    <SelectPrimitive.Value placeholder={placeholder} />
                    <SelectPrimitive.Icon asChild>
                        <ChevronDown className="h-4 w-4 text-zinc-500" />
                    </SelectPrimitive.Icon>
                </SelectPrimitive.Trigger>
                <SelectPrimitive.Portal>
                    <SelectPrimitive.Content
                        position="popper"
                        sideOffset={8}
                        className="z-[120] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.65)]"
                    >
                        <SelectPrimitive.Viewport className="p-1">
                            {options.map((option) => (
                                <SelectPrimitive.Item
                                    key={option.value}
                                    value={option.value}
                                    disabled={option.disabled}
                                    className="relative flex h-10 cursor-pointer select-none items-center rounded-lg px-3 text-sm text-zinc-200 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-orange-500/15 data-[highlighted]:text-white"
                                >
                                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                                    <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center justify-center text-orange-400">
                                        <Check className="h-3.5 w-3.5" />
                                    </SelectPrimitive.ItemIndicator>
                                </SelectPrimitive.Item>
                            ))}
                        </SelectPrimitive.Viewport>
                    </SelectPrimitive.Content>
                </SelectPrimitive.Portal>
            </SelectPrimitive.Root>
        );
    }
);
Select.displayName = "Select";

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
    ({ className, label, ...props }, ref) => {
        const id = useId();
        const [showPassword, setShowPassword] = useState(false);
        const togglePasswordVisibility = () => setShowPassword((prev) => !prev);
        return (
            <div className="grid w-full items-center gap-2">
                {label && <Label htmlFor={id} className="text-zinc-400">{label}</Label>}
                <div className="relative">
                    <Input id={id} type={showPassword ? "text" : "password"} className={cn("pe-10", className)} ref={ref} {...props} />
                    <button type="button" onClick={togglePasswordVisibility} className="absolute inset-y-0 end-0 flex h-full w-10 items-center justify-center text-zinc-500 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50" aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? (<EyeOff className="size-4" aria-hidden="true" />) : (<Eye className="size-4" aria-hidden="true" />)}
                    </button>
                </div>
            </div>
        );
    }
);
PasswordInput.displayName = "PasswordInput";

export interface OTPInputProps {
    value: string;
    onChange: (value: string) => void;
    length?: number;
}
export function OTPInput({ value, onChange, length = 6 }: OTPInputProps) {
    const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        const char = val[val.length - 1] || "";

        const newValue = value.split("");
        newValue[index] = char;
        const combined = newValue.join("").slice(0, length);
        onChange(combined);

        // Move to next input
        if (char && index < length - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === "Backspace" && !value[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    return (
        <div className="flex gap-3 justify-center">
            {Array.from({ length }).map((_, index) => (
                <Input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="w-12 h-14 text-center text-lg font-bold p-0 placeholder:text-zinc-600 transition-all focus:scale-105"
                    placeholder="-"
                    value={value[index] || ""}
                    onChange={(e) => handleChange(e, index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                />
            ))}
        </div>
    );
}

export { Label, Button, Input, PasswordInput, Select };

interface AuthContentProps {
    image?: {
        src: string;
        alt: string;
    };
    quote?: {
        text: string;
        author: string;
    }
}

interface AuthUIProps {
    signInContent?: AuthContentProps;
    signUpContent?: AuthContentProps;
    isSignIn: boolean;
    onToggle: () => void;
    onGoogleClick?: () => void;
    children: React.ReactNode;
}

const defaultSignInContent = {
    image: {
        src: "https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=2070&auto=format&fit=crop",
        alt: "Academic Intelligence"
    },
    quote: {
        text: "Unlock the future of academic intelligence with UnivGPT.",
        author: "UnivGPT"
    }
};

const defaultSignUpContent = {
    image: {
        src: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1974&auto=format&fit=crop",
        alt: "Campus Innovation"
    },
    quote: {
        text: "Join the next generation of university research and learning.",
        author: "UnivGPT"
    }
};

const unifiedImageContent = {
    image: {
        src: "/auth_sidebar_pattern.png",
        alt: "Academic Intelligence"
    }
};

export function AuthUI({ signInContent = {}, signUpContent = {}, isSignIn, onToggle, onGoogleClick, children }: AuthUIProps) {
    const finalSignInContent = {
        image: unifiedImageContent.image,
        quote: { ...defaultSignInContent.quote, ...signInContent.quote },
    };
    const finalSignUpContent = {
        image: unifiedImageContent.image,
        quote: { ...defaultSignUpContent.quote, ...signUpContent.quote },
    };

    const currentContent = isSignIn ? finalSignInContent : finalSignUpContent;

    return (
        <div className="w-full min-h-screen md:grid md:grid-cols-2 bg-transparent relative z-10 overflow-hidden">
            <style>{`
                input[type="password"]::-ms-reveal,
                input[type="password"]::-ms-clear {
                    display: none;
                }
            `}</style>



            <div className="flex h-screen items-center justify-center p-6 md:h-auto md:p-0 md:py-8 z-20">
                <div className="mx-auto grid w-[420px] gap-6 bg-black/40 backdrop-blur-2xl p-8 rounded-[2rem] border border-white/10 shadow-[0_0_50px_-12px_rgba(255,255,255,0.1)]">
                    {children}

                    <div className="space-y-4">
                        <div className="flex items-center gap-4 text-xs uppercase tracking-widest text-zinc-500">
                            <div className="flex-1 border-t border-white/10"></div>
                            <span className="shrink-0">Or</span>
                            <div className="flex-1 border-t border-white/10"></div>
                        </div>

                        {onGoogleClick && (
                            <Button variant="outline" type="button" className="w-full h-11 text-sm rounded-xl group transition-all duration-300 bg-white/5 hover:bg-white/10 text-white border-white/10 shadow-sm" onClick={onGoogleClick}>
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google icon" className="mr-3 h-5 w-5" />
                                Continue with Google
                            </Button>
                        )}
                    </div>

                    <div className="text-center text-sm text-zinc-500">
                        {isSignIn ? "Don't have an account?" : "Already have an account?"}{" "}
                        <Button variant="link" className="p-0 h-auto font-bold text-orange-400 underline decoration-orange-400/20 underline-offset-4 hover:decoration-orange-400" onClick={onToggle}>
                            {isSignIn ? "Sign up" : "Sign in"}
                        </Button>
                    </div>
                </div>
            </div>

            <div
                className="hidden md:block relative bg-cover bg-center transition-all duration-1000 ease-in-out z-20 opacity-90"
                style={{ backgroundImage: `url(${currentContent.image.src})` }}
                key={currentContent.image.src}
            >
                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/20 to-transparent" />
                <div className="relative z-10 flex h-full flex-col items-center justify-center p-12 text-center">
                    <Link to="/" className="absolute top-12 flex items-center gap-3 group">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center transition-transform shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                            <BrandLogo className="text-black w-6 h-6" />
                        </div>
                        <span className="text-3xl font-bold tracking-tighter text-white" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>
                            <span className="text-white">Univ</span>
                            <span className="text-orange-400">GPT</span>
                        </span>
                    </Link>

                    <div className="mb-12" />
                    <blockquote className="space-y-6 max-w-lg">
                        <p className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-[1.1]" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                            “<Typewriter
                                key={currentContent.quote.text}
                                text={currentContent.quote.text}
                                speed={40}
                                className="inline"
                            />”
                        </p>
                        <cite className="block text-[10px] font-bold tracking-[0.3em] uppercase text-orange-500/60 not-italic">
                            — UnivGPT Platform
                        </cite>
                    </blockquote>
                </div>
            </div>
        </div>
    );
}
