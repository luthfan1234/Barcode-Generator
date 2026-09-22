"use client";

import { Clipboard, Copy, Download, Info, QrCode, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { QR_MAX_CHARS, QrError, renderQr, type ErrorLevel, type QrResult } from "@/lib/qr";
import { useToast } from "./Toast";
import { copyImage, downloadDataUrl, pasteInto } from "@/lib/clipboard";

export function QrStudio() {
  const toast = useToast();
  const [teks, setTeks] = useState("");
  const [fill, setFill] = useState("#0f172a");
  const [back, setBack] = useState("#ffffff");
  const [level, setLevel] = useState<ErrorLevel>("M");

  const [hasil, setHasil] = useState<QrResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const buat = useCallback(
    async (manual: boolean) => {
      const isi = teks.trim();
      if (!isi) {
        setHasil(null);
        // Mengosongkan kolom bukan kesalahan. Tapi menekan tombolnya saat
        // kosong adalah aksi sadar — itu harus dijawab.
        if (manual) {
          setError("Isi teks atau link URL dulu.");
          inputRef.current?.focus();
        } else {
          setError(null);
        }
        return;
      }

      setSibuk(true);
      try {
        const r = await renderQr(isi, { fill, back, level });
        setHasil(r);
        setError(null);
      } catch (err) {
        const pesan = err instanceof QrError ? err.message : String(err);
        setError(pesan);
        if (manual) toast(pesan, "error");
      } finally {
        setSibuk(false);
      }
    },
    [teks, fill, back, level, toast],
  );

  // Debounce singkat: cukup untuk tidak menghitung ulang tiap ketukan, belum
  // terasa sebagai jeda.
  useEffect(() => {
    const t = setTimeout(() => void buat(false), 180);
    return () => clearTimeout(t);
  }, [buat]);

  return (
    <section className="panel" id="panel-qr" role="tabpanel" aria-labelledby="tab-qr" tabIndex={0}>
      <div className="panel__head">
        <h2 className="panel__title">QR Code Studio</h2>
        <p className="panel__subtitle">Pratinjau diperbarui sendiri saat kamu mengetik.</p>
      </div>

      <div className="tool-grid">
        <div className="tool-column">
          <div className="field" data-invalid={error ? "true" : undefined}>
            <label className="field__label" htmlFor="qr-data">
              Teks atau link URL
              <span className="field__counter">{teks.trim().length} / {QR_MAX_CHARS}</span>
            </label>
            <div className="input-group">
              <input
                id="qr-data"
                ref={inputRef}
                className="input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://contoh.com atau teks bebas"
                value={teks}
                onChange={(e) => setTeks(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void buat(true); }}
              />
              <button type="button" className="input-group__action"
                      onClick={() => pasteInto(setTeks, toast)}>
                <Clipboard width={12} height={12} aria-hidden="true" /> Tempel
              </button>
            </div>
            {error && <p className="field__error" role="alert">{error}</p>}
          </div>

          <div className="swatch-row">
            <label className="swatch">
              <input type="color" value={fill} onChange={(e) => setFill(e.target.value)} />
              <span className="swatch__meta"><b>Warna kode</b><span>{fill.toUpperCase()}</span></span>
            </label>
            <label className="swatch">
              <input type="color" value={back} onChange={(e) => setBack(e.target.value)} />
              <span className="swatch__meta"><b>Latar</b><span>{back.toUpperCase()}</span></span>
            </label>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="qr-ec">Tingkat koreksi error</label>
            <select id="qr-ec" className="select" value={level}
                    onChange={(e) => setLevel(e.target.value as ErrorLevel)}>
              <option value="L">Rendah — kapasitas teks terbesar</option>
              <option value="M">Sedang — pilihan seimbang</option>
              <option value="Q">Tinggi — tahan goresan</option>
              <option value="H">Maksimum — aman untuk cetak kecil</option>
            </select>
            <p className="field__note">
              <Info width={14} height={14} aria-hidden="true" />
              Makin tinggi koreksi error, makin rapat polanya, tapi tetap terbaca meski sebagian rusak.
            </p>
          </div>

          <button type="button" className="btn btn--primary btn--block" onClick={() => void buat(true)}>
            <RefreshCw width={16} height={16} aria-hidden="true" />
            Buat ulang QR Code
          </button>
        </div>

        <div className="tool-column">
          <div className="preview">
            <div className="preview__stage">
              {hasil ? (
                /* Blur tipis saat gambar diganti menyamarkan jahitan pergantian
                   sehingga terbaca sebagai satu objek, bukan dua yang bertukar. */
                // eslint-disable-next-line @next/next/no-img-element
                <img className="preview__img" src={hasil.dataUrl} alt="Pratinjau QR Code"
                     data-busy={sibuk ? "true" : undefined} />
              ) : (
                <div className="preview__empty">
                  <QrCode width={40} height={40} aria-hidden="true" />
                  <p>Isi kolom di samping untuk melihat pratinjau.</p>
                </div>
              )}
            </div>

            {hasil && (
              <>
                <div className="preview__meta">
                  <span className="chip">Versi {hasil.version}</span>
                  <span className="chip">Koreksi {hasil.errorCorrection}</span>
                  <span className="chip">{hasil.size} px</span>
                </div>
                <div className="actions-row">
                  <button type="button" className="btn btn--primary"
                          onClick={() => { downloadDataUrl(hasil.dataUrl, "omnitools-qrcode.png"); toast("Gambar diunduh"); }}>
                    <Download width={16} height={16} aria-hidden="true" /> Unduh PNG
                  </button>
                  <button type="button" className="btn btn--ghost"
                          onClick={() => void copyImage(hasil.dataUrl, toast)}>
                    <Copy width={16} height={16} aria-hidden="true" /> Salin
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
