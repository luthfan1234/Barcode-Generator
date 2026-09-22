import type { MetadataRoute } from "next";
import { IS_PREVIEW, SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Pratinjau ditutup seluruhnya dari crawler.
  if (IS_PREVIEW) return { rules: { userAgent: "*", disallow: "/" } };

  return {
    rules: { userAgent: "*", allow: "/" },
    // Baris Sitemap hanya ditulis kalau domainnya sudah pasti; URL absolut
    // yang salah membuat crawler mengambil sitemap yang tidak ada.
    ...(SITE_URL ? { sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL } : {}),
  };
}
