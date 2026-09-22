/**
 * Pembuatan barcode di browser lewat bwip-js.
 *
 * Validasinya dipindahkan ke sini dari server: aturan tiap simbologi dicek
 * lebih dulu dengan pesan yang jelas, bukan dibiarkan gagal dengan error
 * mentah dari mesin rendering.
 */

export type BarcodeType =
  | "code128"
  | "ean13"
  | "ean8"
  | "upca"
  | "code39"
  | "isbn13"
  | "itf";

type Rule = {
  /** Nama simbologi di bwip-js. */
  bcid: string;
  pattern: RegExp;
  /** Ditampilkan sebagai petunjuk, dan sebagai pesan error kalau tidak cocok. */
  help: string;
  /** Panjang kode tanpa check digit, untuk simbologi yang memakainya. */
  checkDigitAt?: number;
  label: string;
};

export const BARCODE_RULES: Record<BarcodeType, Rule> = {
  code128: {
    bcid: "code128",
    pattern: /^[\x20-\x7e]{1,48}$/,
    help: "Code 128 menerima huruf, angka, dan simbol ASCII (1-48 karakter).",
    label: "Code 128 — universal, huruf & angka",
  },
  ean13: {
    bcid: "ean13",
    pattern: /^\d{12,13}$/,
    help: "EAN-13 butuh 12 digit angka (check digit dihitung otomatis) atau 13 digit lengkap.",
    checkDigitAt: 12,
    label: "EAN-13 — produk ritel",
  },
  ean8: {
    bcid: "ean8",
    pattern: /^\d{7,8}$/,
    help: "EAN-8 butuh 7 digit angka (check digit dihitung otomatis) atau 8 digit lengkap.",
    checkDigitAt: 7,
    label: "EAN-8 — kemasan kecil",
  },
  upca: {
    bcid: "upca",
    pattern: /^\d{11,12}$/,
    help: "UPC-A butuh 11 digit angka (check digit dihitung otomatis) atau 12 digit lengkap.",
    checkDigitAt: 11,
    label: "UPC-A — standar Amerika",
  },
  code39: {
    bcid: "code39",
    pattern: /^[0-9A-Z\-. $/+%]{1,43}$/,
    help: "Code 39 hanya menerima HURUF KAPITAL, angka, dan simbol - . spasi $ / + %",
    label: "Code 39 — logistik & inventaris",
  },
  isbn13: {
    // ISBN-13 secara fisik memang barcode EAN-13, jadi simbologinya sama.
    // Yang membedakan hanya aturan awalan 978/979.
    bcid: "ean13",
    pattern: /^97[89]\d{9,10}$/,
    help: "ISBN-13 harus diawali 978 atau 979 dan terdiri dari 12-13 digit.",
    checkDigitAt: 12,
    label: "ISBN-13 — buku",
  },
  itf: {
    bcid: "interleaved2of5",
    pattern: /^\d{2,30}$/,
    help: "ITF (Interleaved 2 of 5) hanya menerima angka dengan jumlah digit genap.",
    label: "ITF — karton distribusi",
  },
};

export const BARCODE_HINTS: Record<BarcodeType, string> = {
  code128: "Huruf, angka, dan simbol ASCII, 1–48 karakter.",
  ean13: "12 digit angka — check digit ke-13 dihitung otomatis.",
  ean8: "7 digit angka — check digit ke-8 dihitung otomatis.",
  upca: "11 digit angka — check digit ke-12 dihitung otomatis.",
  code39:
    "HURUF KAPITAL, angka, dan simbol - . spasi $ / + % (huruf kecil dikapitalkan otomatis).",
  isbn13: "Diawali 978 atau 979, total 12–13 digit.",
  itf: "Hanya angka, jumlah digitnya harus genap.",
};

export class BarcodeError extends Error {
  /** Diisi kalau kodenya masih sah sebagai Code 128, supaya UI bisa menawarkan jalan keluar. */
  fallback?: BarcodeType;
  constructor(message: string, fallback?: BarcodeType) {
    super(message);
    this.fallback = fallback;
  }
}

/** Check digit mod-10 yang dipakai EAN-8, EAN-13, dan UPC-A. */
function checkDigit(digits: string): string {
  let sum = 0;
  // Bobot 3 dan 1 berselang-seling, dihitung dari kanan.
  for (let i = 0; i < digits.length; i += 1) {
    const angka = Number(digits[digits.length - 1 - i]);
    sum += i % 2 === 0 ? angka * 3 : angka;
  }
  return String((10 - (sum % 10)) % 10);
}

export type BarcodeResult = {
  dataUrl: string;
  /** Kode final termasuk check digit. */
  code: string;
  /** true kalau server menambahkan atau memperbaiki check digit. */
  adjusted: boolean;
  type: BarcodeType;
};

export type BarcodeOptions = {
  fill?: string;
  back?: string;
  showText?: boolean;
};

/** Hex dari <input type="color"> punya '#', bwip-js tidak menerimanya. */
function hex(value: string | undefined, fallback: string): string {
  const v = (value || fallback).replace("#", "");
  return /^[0-9a-fA-F]{6}$/.test(v) ? v : fallback.replace("#", "");
}

export async function renderBarcode(
  raw: string,
  type: BarcodeType,
  options: BarcodeOptions = {},
): Promise<BarcodeResult> {
  const rule = BARCODE_RULES[type];
  const value = type === "code39" ? raw.trim().toUpperCase() : raw.trim();

  if (!value) throw new BarcodeError("Kode barcode belum diisi.");

  const bisaCode128 =
    type !== "code128" && BARCODE_RULES.code128.pattern.test(value) ? "code128" : undefined;

  if (!rule.pattern.test(value)) {
    throw new BarcodeError(rule.help, bisaCode128 as BarcodeType | undefined);
  }
  if (type === "itf" && value.length % 2 !== 0) {
    throw new BarcodeError("ITF butuh jumlah digit genap.", bisaCode128 as BarcodeType | undefined);
  }

  // Check digit dihitung di sini supaya kode final bisa ditampilkan ke user,
  // dan supaya digit ke-13 yang salah ketik ikut dibetulkan.
  let code = value;
  if (rule.checkDigitAt) {
    const inti = value.slice(0, rule.checkDigitAt);
    code = inti + checkDigit(inti);
  }

  const bwipjs = (await import("bwip-js/browser")).default;
  const canvas = document.createElement("canvas");

  try {
    bwipjs.toCanvas(canvas, {
      bcid: rule.bcid,
      text: code,
      scale: 3,
      height: 14,
      includetext: options.showText !== false,
      textxalign: "center",
      barcolor: hex(options.fill, "#0f172a"),
      backgroundcolor: hex(options.back, "#ffffff"),
      paddingwidth: 6,
      paddingheight: 6,
    });
  } catch (err) {
    throw new BarcodeError(
      `${rule.help} (${err instanceof Error ? err.message : String(err)})`,
      bisaCode128 as BarcodeType | undefined,
    );
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    code,
    adjusted: code !== value,
    type,
  };
}
