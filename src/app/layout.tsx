import type { Metadata } from "next";
import "./globals.css";
import ConditionalLayout from "../components/ConditionalLayout";
import { ToastProvider } from "@/context/ToastContext";

export const metadata: Metadata = {
  title: "Hroast",
  description: "Real-time AI roast interviewer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
  <body className={`antialiased text-foreground min-h-screen bg-gradient-to-br from-surface via-surface-2 to-surface`}> 
        <ToastProvider>
          <ConditionalLayout>{children}</ConditionalLayout>
        </ToastProvider>
      </body>
    </html>
  );
}
