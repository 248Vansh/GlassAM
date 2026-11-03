import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GlassAM — Transparent Glass Manufacturing Intelligence",
  description:
    "An evidence-aware engineering workbench for transparent glass additive manufacturing."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
