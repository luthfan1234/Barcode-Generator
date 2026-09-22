/**
 * Alamat situs, dideteksi otomatis.
 *
 * Nilai ini hanya dibaca di sisi server saat build (metadata, JSON-LD,
 * robots.txt, sitemap.xml), jadi tidak perlu awalan NEXT_PUBLIC_ dan tidak
 * ikut dikirim ke browser sebagai variabel.
 *
 * Urutan pencarian:
 *   1. NEXT_PUBLIC_SITE_URL   — kalau mau memaksa nilai tertentu
 *   2. VERCEL_PROJECT_PRODUCTION_URL — diisi Vercel sendiri, dan otomatis
 *      berubah jadi domain kustom begitu domainnya dipasang. Ini yang membuat
 *      kamu tidak perlu mengatur apa pun.
 *   3. kosong — canonical, og:url, dan sitemap sengaja tidak dirender. URL
 *      absolut yang salah lebih merugikan untuk SEO daripada tidak ada.
 *
 * Sengaja TIDAK memakai VERCEL_URL: nilainya berubah setiap deploy, jadi
 * canonical-nya akan menunjuk ke alamat yang berbeda-beda.
 */

function tanpaGarisMiring(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function deteksi(): string {
  const manual = process.env.NEXT_PUBLIC_SITE_URL;
  if (manual) return tanpaGarisMiring(manual);

  const produksi = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (produksi) {
    const bersih = tanpaGarisMiring(produksi);
    return bersih.startsWith("http") ? bersih : `https://${bersih}`;
  }

  return "";
}

export const SITE_URL = deteksi();

/**
 * Deploy pratinjau tidak boleh diindeks: isinya sama persis dengan produksi,
 * dan Google akan menganggapnya konten duplikat.
 */
export const IS_PREVIEW = process.env.VERCEL_ENV === "preview";
