import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE_URL) return [];
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
  ];
}
