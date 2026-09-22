/** Pembuatan QR Code di browser. Tidak ada request ke server sama sekali. */

import QRCode from "qrcode";

export const QR_MAX_CHARS = 2000;

export type ErrorLevel = "L" | "M" | "Q" | "H";

export type QrResult = {
  dataUrl: string;
  version: number;
  /** Jumlah modul per sisi, menentukan kerapatan polanya. */
  modules: number;
  size: number;
  errorCorrection: ErrorLevel;
};

export class QrError extends Error {}

export async function renderQr(
  raw: string,
  opts: { fill?: string; back?: string; level?: ErrorLevel } = {},
): Promise<QrResult> {
  const text = raw.trim();
  if (!text) throw new QrError("Teks atau link URL belum diisi.");
  if (text.length > QR_MAX_CHARS) {
    throw new QrError(
      `Teks terlalu panjang (${text.length} karakter). Maksimal ${QR_MAX_CHARS}.`,
    );
  }

  const fill = opts.fill || "#0f172a";
  const back = opts.back || "#ffffff";
  if (fill.toLowerCase() === back.toLowerCase()) {
    throw new QrError("Warna QR dan background sama persis, hasilnya tidak akan terbaca.");
  }

  const level = opts.level ?? "M";

  try {
    // create() dipanggil terpisah hanya untuk mengambil versi dan jumlah modul;
    // angka itu yang ditampilkan sebagai keterangan di bawah pratinjau.
    const qr = QRCode.create(text, { errorCorrectionLevel: level });
    const scale = 8;
    const margin = 3;
    const dataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: level,
      margin,
      scale,
      color: { dark: fill, light: back },
    });

    return {
      dataUrl,
      version: qr.version,
      modules: qr.modules.size,
      size: (qr.modules.size + margin * 2) * scale,
      errorCorrection: level,
    };
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    if (/too (big|long)|data (too )?overflow|code length overflow/i.test(pesan)) {
      throw new QrError(
        "Data terlalu padat untuk satu QR Code. Perpendek teks atau turunkan level koreksi error.",
      );
    }
    throw new QrError(`Gagal membuat QR Code: ${pesan}`);
  }
}
