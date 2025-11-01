import type { Metadata } from "next";
import "./globals.css";
import ConditionalLayout from "../components/ConditionalLayout";

export const metadata: Metadata = {
  title: "AI Interview Assistant",
  description: "Real-time AI interview assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
  <body className={`antialiased text-foreground min-h-screen bg-gradient-to-br from-surface via-surface-2 to-surface`}> 
        <ConditionalLayout>{children}</ConditionalLayout>
      </body>
    </html>
  );
}
