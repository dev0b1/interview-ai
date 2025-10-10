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
      <body className={`antialiased`}>
  <ConditionalLayout>{children}</ConditionalLayout>
      </body>
    </html>
  );
}
