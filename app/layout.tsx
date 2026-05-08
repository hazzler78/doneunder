import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://doneunder.ai";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "doneunder.ai | Commercial Diving Marketplace",
  description:
    "High-trust B2B marketplace connecting commercial divers and offshore contractors.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "doneunder.ai",
    title: "doneunder.ai | Commercial Diving Marketplace",
    description:
      "The premium commercial diving talent marketplace — AI-powered matching for saturation divers, underwater welders, NDT specialists, and offshore contractors.",
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
      "High-trust B2B marketplace connecting commercial divers and offshore contractors.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
