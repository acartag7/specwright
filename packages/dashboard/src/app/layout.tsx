import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { OpencodeProvider } from "@/contexts/OpencodeContext";
import { OpencodeStatus } from "@/components/OpencodeStatus";

export const metadata: Metadata = {
  title: "Spec-Driven Dev",
  description: "Write specs, break into chunks, execute with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased">
        <OpencodeProvider>
          <ToastProvider>
            {/* Global header with opencode status */}
            <header className="border-b border-neutral-800/50 px-4 py-2 flex items-center justify-between bg-neutral-950/80 backdrop-blur-sm sticky top-0 z-50">
              <span className="font-mono text-sm text-neutral-400">specwright</span>
              <OpencodeStatus />
            </header>
            {children}
          </ToastProvider>
        </OpencodeProvider>
      </body>
    </html>
  );
}
