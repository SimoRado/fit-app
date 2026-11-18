import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export const metadata: Metadata = {
  title: { default: "Cubyfit | Support & Legal", template: "%s | Cubyfit" },
  description: "Official support and legal information for the Cubyfit fitness and personal-growth mobile application.",
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  openGraph: {
    title: "Cubyfit | Support & Legal",
    description: "Official support and legal information for the Cubyfit mobile application.",
    siteName: "Cubyfit",
    type: "website",
    ...(siteUrl ? { images: [{ url: "/cubyfit-icon.png", width: 512, height: 512, alt: "Cubyfit" }] } : {}),
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
