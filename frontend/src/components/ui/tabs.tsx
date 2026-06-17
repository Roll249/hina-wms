"use client";

import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  onValueChange: (v: string) => void;
}

const TabsContext = createContext<TabsContextValue>({ value: "", onValueChange: () => {} });

export function Tabs({ value, onValueChange, children, className }: {
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-1 p-1 bg-gray-100 rounded-lg mb-3", className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className }: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  const isActive = ctx.value === value;
  return (
    <button
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "flex-1 py-2 px-3 text-sm font-medium rounded-md",
        isActive ? "bg-white text-primary-600 shadow-sm" : "text-gray-600",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(TabsContext);
  if (ctx.value !== value) return null;
  return <div>{children}</div>;
}
