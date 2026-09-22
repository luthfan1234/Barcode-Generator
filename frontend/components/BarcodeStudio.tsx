"use client";

import { Clipboard, Copy, Download, Info, RefreshCw, ScanBarcode } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BARCODE_HINTS,
  BARCODE_RULES,
  BarcodeError,
  renderBarcode,
  type BarcodeResult,
  type BarcodeType,
} from "@/lib/barcode";
import { copyImage, downloadDataUrl, pasteInto } from "@/lib/clipboard";
import { useToast } from "./Toast";

const URUTAN: BarcodeType[] = ["code128", "ean13", "ean8", "upca", "code39", "isbn13", "itf"];

export function BarcodeStudio() {
  const toast = useToast();
  const [kode, setKode] = useState("");
  const [tipe, setTipe] = useState<BarcodeType>("code128");
  const [fill, setFill] = useState("#0f172a");
  const [back, setBack] = useState("#ffffff");

  const [hasil, setHasil] = useState<BarcodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<BarcodeType | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const buat = useCallback(
    async (manual: boolean) => {
      const isi = kode.trim();
      if (!isi) {
        setHasil(null);
        setFallback(null);
        if (manual) {
          setError("Isi kode atau nomor produk dulu.");
          inputRef.current?.focus();
        } else {
          setError(null);
        }
        return;
      }

      setSibuk(true);
      try {
        const r = await renderBarcode(isi, tipe, { fill, back });
        setHasil(r);
        setError(null);
        setFallback(null);
      } catch (err) {
        const pesan = err instanceof Error ? err.message : String(err);
        setError(pesan);
        setFallback(err instanceof BarcodeError ? err.fallback ?? null : null);
        if (manual) toast(pesan, "error");
      } finally {
        setSibuk(false);
      }
    },
    [kode, tipe, fill, back, toast],
  );

  useEffect(() => {
    const t = setTimeout(() => void buat(false), 200);
    return () => clearTimeout(t);
  }, [buat]);

  return (
    <section className="panel" id="panel-barcode" role="tabpanel" aria-labelledby="tab-barcode" tabIndex={0}>
      <div className="panel__head">
        <h2 className="panel__title">Barcode Studio</h2>
        <p className="panel__subtitle">Tujuh simbologi standar, divalidasi sebelum dibuat.</p>
      </div>

      <div className="tool-grid">
        <div className="tool-column">
          <div className="field" data-invalid={error ? "true" : undefined}>
            <label className="field__label" htmlFor="barcode-data">Kode atau nomor produk</label>
            <div className="input-group">
              <input
                id="barcode-data"
                ref={inputRef}
                className="input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Contoh: OMNI-2026-X9"
                value={kode}
                onChange={(e) => setKode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void buat(true); }}
              />
              <button type="button" className="input-group__action"
                      onClick={() => pasteInto(setKode, toast)}>
                <Clipboard width={12} height={12} aria-hidden="true" /> Tempel
              </button>
            </div>

            {error && (
              <p className="field__error" role="alert">
                <span>{error}</span>{" "}
                {fallback && (
                  <button type="button" className="field__error-action"
                          onClick={() => { setTipe(fallback); }}>
                    Pakai Code 128
                  </button>
                )}
              </p>
            )}

            <p className="field__note">
              <Info width={14} height={14} aria-hidden="true" />
              <span>{BARCODE_HINTS[tipe]}</span>
            </p>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="barcode-type">Simbologi</label>
            <select id="barcode-type" className="select" value={tipe}
                    onChange={(e) => setTipe(e.target.value as BarcodeType)}>
              {URUTAN.map((t) => (
                <option key={t} value={t}>{BARCODE_RULES[t].label}</option>
              ))}
            </select>
          </div>

          <div className="swatch-row">
            <label className="swatch">
              <input type="color" value={fill} onChange={(e) => setFill(e.target.value)} />
              <span className="swatch__meta"><b>Warna bar</b><span>{fill.toUpperCase()}</span></span>
            </label>
            <label className="swatch">
              <input type="color" value={back} onChange={(e) => setBack(e.target.value)} />
              <span className="swatch__meta"><b>Latar</b><span>{back.toUpperCase()}</span></span>
            </label>
          </div>

          <button type="button" className="btn btn--primary btn--block" onClick={() => void buat(true)}>
            <RefreshCw width={16} height={16} aria-hidden="true" />
            Buat ulang barcode
          </button>
        </div>

        <div className="tool-column">
          <div className="preview">
            <div className="preview__stage">
              {hasil ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="preview__img" src={hasil.dataUrl} alt="Pratinjau barcode"
                     data-busy={sibuk ? "true" : undefined} />
              ) : (
                <div className="preview__empty">
                  <ScanBarcode width={40} height={40} aria-hidden="true" />
                  <p>Masukkan kode untuk melihat pratinjau.</p>
                </div>
              )}
            </div>

            {hasil && (
              <>
                <div className="preview__meta">
                  <span className="chip">{hasil.type.toUpperCase()}</span>
                  <span className="chip">{hasil.code}</span>
                  {hasil.adjusted && <span className="chip chip--accent">check digit ditambahkan</span>}
                </div>
                <div className="actions-row">
                  <button type="button" className="btn btn--primary"
                          onClick={() => { downloadDataUrl(hasil.dataUrl, "omnitools-barcode.png"); toast("Gambar diunduh"); }}>
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
