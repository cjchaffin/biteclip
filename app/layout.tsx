import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BiteClip",
  description: "Create Discord soundboard bites from YouTube audio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
