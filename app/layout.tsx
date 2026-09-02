import type { Metadata } from "next";
import { Geist_Mono, Outfit, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { ConditionalSiteFooter } from "@/components/conditional-site-footer";
import { ThemeProvider } from "@/components/theme-provider";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site";

const outfit = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-sans-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
