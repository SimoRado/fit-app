import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  return siteUrl ? [{ url: siteUrl, changeFrequency: "monthly", priority: 1 }] : [];
}
