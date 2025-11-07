"use client";
import React, { createContext, useCallback, useContext, useState } from "react";
import Toast from "@/components/Toast";

type ToastItem = {
  id: string;
  message: string;
  duration?: number;
};

type ToastContextType = {
  addToast: (message: string, opts?: { duration?: number }) => string;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, opts?: { duration?: number }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const item: ToastItem = { id, message, duration: opts?.duration ?? 5000 };
    setToasts((t) => [...t, item]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Global toast container */}
      <div aria-live="polite" className="fixed inset-0 pointer-events-none z-50">
        <div className="flex flex-col items-end p-4 space-y-2">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto">
              <Toast message={t.message} duration={t.duration} onClose={() => removeToast(t.id)} />
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
};
