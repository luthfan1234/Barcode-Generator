/**
 * Satu sumber data untuk FAQ: dipakai merender accordion sekaligus structured
 * data JSON-LD. Google menganggap structured data yang isinya berbeda dari yang
 * terlihat di halaman sebagai pelanggaran, jadi keduanya tidak boleh terpisah.
 */

export type FaqItem = {
  id: string;
  question: string;
  /** Tiap elemen jadi satu paragraf. Boleh mengandung <code> dan <b>. */
  answer: string[];
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "faq-1",
    question: "Data saya dikirim ke pihak ketiga?",
    answer: [
      "QR Code, barcode, dan penghapusan background diproses sepenuhnya di browser kamu — " +
        "gambarnya tidak pernah meninggalkan perangkat. Hanya Downloader yang memanggil server, " +
        "karena browser tidak diizinkan mengambil konten langsung dari platform sosial media.",
    ],
  },
  {
    id: "faq-2",
    question: "Kenapa hapus background terasa lama saat pertama kali?",
    answer: [
      "Model pemisah background diunduh sekali ke browser, sekitar 45 MB, lalu disimpan di cache. " +
        "Pemakaian berikutnya langsung jalan tanpa mengunduh ulang.",
      "Prosesnya memakai prosesor perangkatmu sendiri, jadi komputer yang lebih kencang " +
        "menyelesaikannya lebih cepat.",
    ],
  },
  {
    id: "faq-3",
    question: "Simbologi barcode mana yang harus saya pilih?",
    answer: [
      "Kalau kodenya mengandung huruf atau tanda baca, pakai <b>Code 128</b>. Untuk produk ritel " +
        "yang didaftarkan resmi, pakai <b>EAN-13</b> (12 digit, digit ke-13 dihitung otomatis) " +
        "atau <b>UPC-A</b> untuk pasar Amerika.",
      "Kalau kamu salah pilih, pesan errornya menyebutkan aturan formatnya dan menawarkan tombol " +
        "untuk pindah ke Code 128.",
    ],
  },
  {
    id: "faq-4",
    question: "Kenapa Downloader kadang gagal?",
    answer: [
      "Platform sosial media membatasi berapa kali satu alamat boleh membuka konten tanpa login. " +
        "Kalau kena batas, tunggu beberapa menit lalu coba lagi.",
      "Konten privat, sudah dihapus, atau yang dibatasi wilayah memang tidak bisa diambil, dan " +
        "pesan errornya akan menyebutkan yang mana.",
    ],
  },
  {
    id: "faq-5",
    question: "Ada batas ukuran file?",
    answer: [
      "Foto untuk hapus background maksimal 15 MB. Teks QR Code maksimal 2000 karakter. " +
        "Unduhan video dibatasi 1080p dan 200 MB supaya tidak menggantung terlalu lama.",
    ],
  },
];

/** Tag HTML dibuang untuk JSON-LD supaya teksnya bersih. */
export function faqPlainText(item: FaqItem): string {
  return item.answer.join(" ").replace(/<[^>]+>/g, "");
}
