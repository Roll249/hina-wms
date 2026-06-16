import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  onClick?: () => void;
}

const paddingClass = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function Card({ children, className, padding = "md", onClick }: CardProps) {
  return (
    <div
      className={cn("card", paddingClass[padding], onClick && "cursor-pointer", className)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
