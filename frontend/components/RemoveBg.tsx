"use client";

import { Copy, Download, FolderOpen, ImageUp, Info, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CompareSlider } from "./CompareSlider";
import { copyImage, downloadDataUrl } from "@/lib/clipboard";
import { useToast } from "./Toast";

const MAX_BYTES = 15 * 1024 * 1024;
const JENIS_DIDUKUNG = ["image/png", "image/jpeg", "image/webp"];

export function RemoveBg() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragover, setDragover] = useState(false);
  const [asli, setAsli] = useState<string | null>(null);
  const [hasil, setHasil] = useState<string | null>(null);
  const [ukuran, setUkuran] = useState<string | null>(null);
  const [proses, setProses] = useState(false);
  const [tahap, setTahap] = useState("Menyiapkan model…");
  const [error, setError] = useState<string | null>(null);

  // Object URL foto asli dilepas saat diganti supaya tidak menumpuk di memori.
  useEffect(() => () => { if (asli) URL.revokeObjectURL(asli); }, [asli]);

  async function proses_gambar(file: File) {
    if (!JENIS_DIDUKUNG.includes(file.type)) {
      setError("Format belum didukung. Gunakan JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Ukuran ${(file.size / 1048576).toFixed(1)} MB melebihi batas 15 MB.`);
      return;
    }

    setError(null);
    setHasil(null);
    setAsli(URL.createObjectURL(file));
    setProses(true);
    setTahap("Menyiapkan model…");

    try {
      // Diimpor dinamis supaya paket ini tidak ikut ke bundel awal halaman:
      // ukurannya besar dan hanya dibutuhkan kalau tab ini benar-benar dipakai.
      const { removeBackground } = await import("@imgly/background-removal");

      const blob = await removeBackground(file, {
        progress: (key, current, total) => {
          const persen = total ? Math.round((current / total) * 100) : 0;
          setTahap(
            key.startsWith("fetch")
              ? `Mengunduh model… ${persen}%`
              : `Memproses gambar… ${persen}%`,
          );
        },
      });

      const url = URL.createObjectURL(blob);
      // Dibaca ke data URL supaya bisa disalin ke clipboard dan diunduh tanpa
      // bergantung pada object URL yang umurnya terbatas.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Gagal membaca hasil."));
        fr.readAsDataURL(blob);
      });
      URL.revokeObjectURL(url);

      const dim = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(`${img.naturalWidth} × ${img.naturalHeight} px`);
        img.onerror = () => resolve("");
        img.src = dataUrl;
      });

      setHasil(dataUrl);
      setUkuran(dim || null);
      toast("Background dihapus");
    } catch (err) {
      const pesan = err instanceof Error ? err.message : String(err);
      setError(`Gagal memproses gambar: ${pesan}`);
      toast("Gagal memproses gambar", "error");
    } finally {
      setProses(false);
    }
  }

  function reset() {
    if (asli) URL.revokeObjectURL(asli);
    setAsli(null);
    setHasil(null);
    setUkuran(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const tampilkanDropzone = !asli && !proses;

  return (
    <section className="panel" id="panel-removebg" role="tabpanel" aria-labelledby="tab-removebg" tabIndex={0}>
      <div className="panel__head">
        <h2 className="panel__title">Remove Background</h2>
        <p className="panel__subtitle">
          Diproses di browser kamu sendiri — gambarnya tidak pernah dikirim ke mana pun.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="visually-hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void proses_gambar(f); }}
      />

      {tampilkanDropzone && (
        <button
          type="button"
          className="dropzone"
          data-dragover={dragover ? "true" : undefined}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => { e.preventDefault(); setDragover(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragover(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragover(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void proses_gambar(f);
          }}
        >
          <span className="dropzone__icon" aria-hidden="true"><ImageUp width={26} height={26} /></span>
          <span className="dropzone__title">Lepas foto di sini, atau klik untuk memilih</span>
          <span className="dropzone__hint">JPG, PNG, atau WebP sampai 15 MB</span>
          <span className="btn btn--ghost btn--sm" aria-hidden="true">
            <FolderOpen width={15} height={15} /> Pilih gambar
          </span>
        </button>
      )}

      {error && <p className="field__error" role="alert" style={{ marginTop: 12 }}>{error}</p>}

      {proses && (
        <div className="result-stack" style={{ marginTop: 16 }}>
          <p className="field__note">
            <Info width={14} height={14} aria-hidden="true" />
            <span>{tahap} Pemakaian pertama mengunduh model sekitar 45 MB, setelah itu tersimpan di cache.</span>
          </p>
          <div className="progress" role="progressbar" aria-label="Memproses gambar" />
        </div>
      )}

      {asli && hasil && (
        <div className="result-stack" style={{ marginTop: 16 }}>
          <CompareSlider before={asli} after={hasil} />
          {ukuran && <div className="preview__meta"><span className="chip">{ukuran}</span></div>}
          <div className="actions-row">
            <button type="button" className="btn btn--primary"
                    onClick={() => { downloadDataUrl(hasil, "omnitools-transparan.png"); toast("Gambar diunduh"); }}>
              <Download width={16} height={16} aria-hidden="true" /> Unduh PNG transparan
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => void copyImage(hasil, toast)}>
              <Copy width={16} height={16} aria-hidden="true" /> Salin
            </button>
            <button type="button" className="btn btn--ghost" onClick={reset}>
              <RotateCcw width={16} height={16} aria-hidden="true" /> Ganti foto
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
