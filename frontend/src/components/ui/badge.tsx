import { cn } from "@/lib/utils";

interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "gray" | "primary";
  children: React.ReactNode;
  className?: string;
}

const variantClass = {
  default: "bg-blue-50 text-blue-600 border border-blue-200",
  success: "bg-green-50 text-green-600 border border-green-200",
  warning: "bg-amber-50 text-amber-600 border border-amber-200",
  danger: "bg-red-50 text-red-600 border border-red-200",
  info: "bg-blue-50 text-blue-600 border border-blue-200",
  gray: "bg-gray-100 text-gray-600 border border-gray-200",
  primary: "bg-primary-50 text-primary-600 border border-primary-200",
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span className={cn("badge", variantClass[variant], className)}>
      {children}
    </span>
  );
}
