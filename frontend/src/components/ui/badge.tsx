import { cn } from "@/lib/utils";

interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "gray";
  children: React.ReactNode;
  className?: string;
}

const variantClass = {
  default: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
  gray: "bg-gray-100 text-gray-800",
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span className={cn("badge", variantClass[variant], className)}>
      {children}
    </span>
  );
}
