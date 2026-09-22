/**
 * Klien untuk API downloader (Flask + yt-dlp) yang berjalan terpisah.
 *
 * Ini satu-satunya bagian yang memanggil server: browser tidak diizinkan
 * mengambil konten lintas domain dari Instagram, TikTok, YouTube, maupun
 * Facebook, dan tidak ada padanan yt-dlp yang berjalan di browser.
 */

export const API_BASE = (process.env.NEXT_PUBLIC_DOWNLOADER_API || "").replace(/\/+$/, "");

export const DOWNLOADER_ENABLED = API_BASE.length > 0;

export type SocialInfo = {
  success: true;
  platform: string;
  platform_label: string;
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  duration: string | null;
  quality: string | null;
  has_video: boolean;
  has_audio: boolean;
  merged: boolean;
  note: string | null;
  webpage_url: string;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

/**
 * Balasan dibaca sebagai teks dulu, bukan langsung .json(). Kalau parsing
 * gagal, isinya masih ada di tangan dan bisa ikut dilaporkan — daripada hanya
 * bisa bilang "format tidak dikenali" tanpa petunjuk apa pun.
 */
async function bacaJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const cuplikan = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
    throw new ApiError(
      `Server membalas bukan JSON (HTTP ${res.status})` +
        (cuplikan ? `: ${cuplikan}` : ". Balasannya kosong."),
      res.status,
    );
  }
}

function jelaskanKegagalanJaringan(err: unknown): never {
  if (err instanceof ApiError) throw err;
  // Penyebab paling sering: server Render masih bangun dari tidur, atau
  // ALLOWED_ORIGINS belum memuat domain ini sehingga browser memblokirnya.
  throw new ApiError(
    "Tidak bisa menghubungi server downloader. Kalau baru pertama dipakai setelah lama " +
      "menganggur, server butuh waktu untuk bangun — coba lagi sebentar lagi.",
  );
}

export async function resolveSocial(url: string, signal?: AbortSignal): Promise<SocialInfo> {
  if (!DOWNLOADER_ENABLED) {
    throw new ApiError("Downloader belum dikonfigurasi (NEXT_PUBLIC_DOWNLOADER_API kosong).");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/social/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch (err) {
    jelaskanKegagalanJaringan(err);
  }

  const data = await bacaJson(res);
  if (!res.ok || !data.success) {
    throw new ApiError(String(data.error || `Permintaan gagal (${res.status}).`), res.status);
  }
  return data as unknown as SocialInfo;
}

/** Ambil nama berkas dari Content-Disposition; butuh header CORS Expose-Headers. */
function namaBerkas(res: Response, fallback: string): string {
  const header = res.headers.get("Content-Disposition") || "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return m ? decodeURIComponent(m[1]) : fallback;
}

export async function downloadSocial(url: string, mode: "video" | "audio"): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/social/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, mode }),
    });
  } catch (err) {
    jelaskanKegagalanJaringan(err);
  }

  const tipe = res.headers.get("Content-Type") || "";
  if (!res.ok || tipe.includes("application/json")) {
    const data = await bacaJson(res);
    throw new ApiError(String(data.error || `Unduhan gagal (${res.status}).`), res.status);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = namaBerkas(res, mode === "audio" ? "omnitools.m4a" : "omnitools.mp4");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export const PLATFORM_HOSTS: Record<string, string[]> = {
  instagram: ["instagram.com", "instagr.am"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  facebook: ["facebook.com", "fb.watch"],
};

/** Deteksi platform dari teks link, dipakai untuk menyorot chip saat mengetik. */
export function detectPlatform(url: string): string | null {
  const v = url.trim().toLowerCase();
  if (!v) return null;
  for (const [key, hosts] of Object.entries(PLATFORM_HOSTS)) {
    if (hosts.some((h) => v.includes(h))) return key;
  }
  return null;
}
