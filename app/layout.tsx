import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { ConditionalSiteFooter } from "@/components/conditional-site-footer";
import { ThemeProvider } from "@/components/theme-provider";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site";

// Self-hosted. next/font/google downloads CSS at build time, and Google
// sometimes returns extensionless font URLs that crash Next.js 15.5.
const outfit = localFont({
  src: "../fonts/outfit-latin.woff2",
  variable: "--font-display",
  weight: "100 900",
  display: "swap",
});

const sourceSans = localFont({
  src: "../fonts/source-sans-3-latin.woff2",
  variable: "--font-sans-body",
  weight: "200 900",
  display: "swap",
});

const geistMono = localFont({
  src: "../fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "doneunder.ai | Commercial Diving Marketplace",
  description:
    "High-trust B2B marketplace connecting commercial divers with Offshore and Inshore contractors — an AI agent that reviews CVs, matches campaigns, and keeps you mobilization-ready.",
  verification: {
    google: "pESPOJvmn_M3xe5FQ_-PTQwk1sEGpi6gge7dEKP485c",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "doneunder.ai",
    title: "doneunder.ai | Commercial Diving Marketplace",
    description:
      "The premium commercial diving talent marketplace — AI-powered matching connecting commercial divers, underwater welders, and NDT specialists with Offshore and Inshore contractors.",
    images: [
      {
        url: "/og.jpg",
        width: 1168,
        height: 784,
        alt: "doneunder.ai — commercial diving marketplace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "doneunder.ai | Commercial Diving Marketplace",
    description:
      "High-trust B2B marketplace connecting commercial divers with Offshore and Inshore contractors.",
    images: ["/og.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${sourceSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <ConditionalSiteFooter />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
