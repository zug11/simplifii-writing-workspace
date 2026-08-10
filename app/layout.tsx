import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simplifii — Assignment workspace",
  description: "A neuroinclusive assignment workspace that turns course material into focused writing guidance.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
