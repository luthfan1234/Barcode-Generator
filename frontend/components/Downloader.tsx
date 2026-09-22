"use client";

import {
  Camera, Clipboard, Info, MonitorPlay, Music, Music2, Play, Search, ShieldCheck, ThumbsUp, TriangleAlert, Video,
} from "lucide-react";
import { useState } from "react";
import { DOWNLOADER_ENABLED, ApiError, detectPlatform, downloadSocial, resolveSocial, type SocialInfo } from "@/lib/api";
import { pasteInto } from "@/lib/clipboard";
import { useToast } from "./Toast";

const PLATFORM = [
  { id: "instagram", label: "Instagram", Icon: Camera },
  { id: "tiktok", label: "TikTok", Icon: Music2 },
  { id: "youtube", label: "YouTube", Icon: MonitorPlay },
  { id: "facebook", label: "Facebook", Icon: ThumbsUp },
] as const;

export function Downloader() {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<SocialInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mencari, setMencari] = useState(false);
  const [mengunduh, setMengunduh] = useState<"video" | "audio" | null>(null);
  const [gambarRusak, setGambarRusak] = useState(false);

  const platformAktif = detectPlatform(url);

  async function cek() {
    const link = url.trim();
    if (!link) {
      setError("Link konten belum diisi.");
      return;
    }
    setError(null);
    setMencari(true);
    setInfo(null);
    setGambarRusak(false);
    try {
      setInfo(await resolveSocial(link));
      toast("Media terdeteksi");
    } catch (err) {
      const pesan = err instanceof ApiError ? err.message : String(err);
      setError(pesan);
      toast(pesan, "error");
    } finally {
      setMencari(false);
    }
  }

  async function unduh(mode: "video" | "audio") {
    setMengunduh(mode);
    toast("Mengambil file dari server…", "info");
    try {
      await downloadSocial(url.trim(), mode);
      toast("Berhasil diunduh");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : String(err), "error");
    } finally {
      setMengunduh(null);
    }
  }

  return (
    <section className="panel" id="panel-downloader" role="tabpanel" aria-labelledby="tab-downloader" tabIndex={0}>
      <div className="panel__head">
        <h2 className="panel__title">Social Downloader</h2>
        <p className="panel__subtitle">Tempel link publik, server yang mengambil filenya.</p>
      </div>

      {!DOWNLOADER_ENABLED && (
        <div className="notice notice--warn">
          <TriangleAlert width={16} height={16} aria-hidden="true" />
          <span>
            Downloader belum dikonfigurasi. Isi <code>NEXT_PUBLIC_DOWNLOADER_API</code> dengan
            alamat API-nya, lalu deploy ulang.
          </span>
        </div>
      )}

      <div className="chip-row" aria-label="Platform yang didukung">
        {PLATFORM.map(({ id, label, Icon }) => (
          <span key={id} className="chip" data-active={platformAktif === id ? "true" : undefined}>
            <Icon width={13} height={13} /> {label}
          </span>
        ))}
      </div>

      <div className="field" data-invalid={error ? "true" : undefined}>
        <label className="field__label" htmlFor="social-url">Link konten</label>
        <div className="input-group">
          <input
            id="social-url"
            className="input"
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www.tiktok.com/@akun/video/… atau https://www.instagram.com/reel/…"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") void cek(); }}
          />
          <button type="button" className="input-group__action" onClick={() => pasteInto(setUrl, toast)}>
            <Clipboard width={12} height={12} aria-hidden="true" /> Tempel
          </button>
        </div>
        {error && <p className="field__error" role="alert">{error}</p>}
      </div>

      <button type="button" className="btn btn--primary btn--block"
              disabled={!DOWNLOADER_ENABLED || mencari}
              data-loading={mencari ? "true" : undefined}
              onClick={() => void cek()}>
        <span className="btn__spinner" aria-hidden="true" />
        <Search className="btn__icon" width={16} height={16} aria-hidden="true" />
        {mencari ? "Mencari…" : "Cek media"}
      </button>

      {info && (
        <div className="result-stack" style={{ marginTop: 16 }}>
          <div className="media-card">
            <div className="media-card__thumb">
              {info.thumbnail && !gambarRusak ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.thumbnail} alt="" referrerPolicy="no-referrer"
                     onError={() => setGambarRusak(true)} />
              ) : (
                <Play width={26} height={26} aria-hidden="true" />
              )}
            </div>
            <div className="media-card__body">
              <h3 className="media-card__title">{info.title}</h3>
              <div className="media-card__meta">
                <span className="chip chip--accent">{info.platform_label}</span>
                {info.uploader && <span className="chip">{info.uploader}</span>}
                {info.duration && <span className="chip">{info.duration}</span>}
                {info.quality && <span className="chip">{info.quality}</span>}
              </div>
            </div>
          </div>

          <div className="actions-row">
            <button type="button" className="btn btn--primary"
                    disabled={!info.has_video || mengunduh !== null}
                    data-loading={mengunduh === "video" ? "true" : undefined}
                    onClick={() => void unduh("video")}>
              <span className="btn__spinner" aria-hidden="true" />
              <Video className="btn__icon" width={16} height={16} aria-hidden="true" /> Unduh video
            </button>
            <button type="button" className="btn btn--ghost"
                    disabled={!info.has_audio || mengunduh !== null}
                    data-loading={mengunduh === "audio" ? "true" : undefined}
                    onClick={() => void unduh("audio")}>
              <span className="btn__spinner" aria-hidden="true" />
              <Music className="btn__icon" width={16} height={16} aria-hidden="true" /> Unduh audio saja
            </button>
          </div>

          {/* Tombol mati tanpa keterangan hanya bikin bingung, jadi alasan dari
              server ikut ditampilkan. */}
          {info.note && (
            <p className="field__note">
              <Info width={14} height={14} aria-hidden="true" />
              <span>{info.note}</span>
            </p>
          )}

          <p className="field__note">
            <ShieldCheck width={14} height={14} aria-hidden="true" />
            <span>
              Gunakan hanya untuk konten publik yang kamu berhak simpan. Video diambil maksimal
              1080p, dan unduhan besar butuh waktu karena file dialirkan lewat server.
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
