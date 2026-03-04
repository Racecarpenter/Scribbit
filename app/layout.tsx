import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://scribbit.chat'),

  title: 'Scribb’it',
  description: 'Send scribbles. Transform. Reveal.',

  openGraph: {
    title: 'Scribb’it',
    description: 'Send scribbles. Transform. Reveal.',
    url: 'https://scribbit.chat',
    siteName: 'Scribb’it',
    type: 'website',
    images: [
      {
        // IMPORTANT: this becomes absolute because metadataBase is set
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Scribb’it',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Scribb’it',
    description: 'Send scribbles. Transform. Reveal.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
