import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner"
import { ClerkProvider } from "@clerk/nextjs";
import { Fraunces, DM_Sans, JetBrains_Mono } from "next/font/google"

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
})

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-body",
})

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Assistly",
  description: "A quiet place to talk to your AI assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${fraunces.variable} ${dmSans.variable} ${jetbrains.variable}`}>
        <body
          className="min-h-screen flex"
        >
          {children}
          <Toaster position="bottom-center" />
        </body>
      </html>
    </ClerkProvider>
  );
}
