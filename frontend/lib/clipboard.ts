/** Helper unduh dan clipboard yang dipakai beberapa alat sekaligus. */

type Toast = (text: string, variant?: "success" | "error" | "info") => void;

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function copyImage(dataUrl: string, toast: Toast) {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    toast("Browser ini belum mendukung salin gambar. Pakai tombol unduh.", "error");
    return;
  }
  try {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    toast("Gambar disalin ke clipboard");
  } catch {
    toast("Gagal menyalin gambar. Pakai tombol unduh.", "error");
  }
}

export async function pasteInto(set: (value: string) => void, toast: Toast) {
  if (!navigator.clipboard?.readText) {
    toast("Browser ini butuh tempel manual (Ctrl+V)", "info");
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      toast("Clipboard kosong", "info");
      return;
    }
    set(text.trim());
    toast("Teks ditempel");
  } catch {
    toast("Izin clipboard ditolak, tempel manual dengan Ctrl+V", "info");
  }
}
