import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "xl";
}

const variantClass = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  ghost: "btn bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-300",
};

const sizeClass = {
  sm: "text-sm px-3 py-1.5",
  md: "",
  lg: "btn-lg",
  xl: "text-xl px-8 py-4 rounded-2xl font-semibold",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(variantClass[variant], sizeClass[size], className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
