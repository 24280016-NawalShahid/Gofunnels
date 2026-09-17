import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Transcript Grabber",
  description: "Paste a YouTube link, get the transcript instantly.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
