"""OmniTools Downloader API — khusus mengambil media dari sosial media.

Dipisahkan dari frontend karena ini satu-satunya fitur yang memang butuh
server: browser tidak diizinkan mengambil konten lintas domain dari Instagram,
TikTok, YouTube, maupun Facebook (diblokir CORS oleh mereka), dan tidak ada
padanan yt-dlp yang bisa berjalan di browser.

QR Code, barcode, dan penghapusan background tidak ada di sini — ketiganya
berjalan sepenuhnya di browser pada frontend Next.js.

Dijalankan di Render:
    gunicorn app:app
"""

from __future__ import annotations

import os
import re
import shutil
import tempfile
import time
from urllib.parse import urlparse

from flask import Flask, Response, jsonify, request, send_file
from werkzeug.exceptions import HTTPException

app = Flask(__name__)

# --------------------------------------------------------------------------- #
# Konfigurasi
# --------------------------------------------------------------------------- #

# Domain frontend yang boleh memanggil API ini, dipisah koma. Contoh:
#   ALLOWED_ORIGINS=https://omnitools.vercel.app,https://omnitools.com
# Dikosongkan berarti semua domain boleh — praktis saat pengembangan, tapi
# jangan dibiarkan kosong kalau cookies diisi (lihat peringatan di bawah).
ALLOWED_ORIGINS = [
    o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()
]

# Cookies opsional. Instagram dan Facebook membatasi akses anonim dengan cepat;
# mengisi salah satu ini membuat yt-dlp memakai sesi login yang sudah ada.
#   YTDLP_COOKIES_FILE=/etc/secrets/cookies.txt   (Render: Secret File)
#   YTDLP_COOKIES_FROM_BROWSER=chrome             (hanya berguna saat lokal)
YTDLP_COOKIES_FILE = os.environ.get("YTDLP_COOKIES_FILE", "").strip()
YTDLP_COOKIES_BROWSER = os.environ.get("YTDLP_COOKIES_FROM_BROWSER", "").strip()

# Diisi kalau ffmpeg ada tapi tidak masuk PATH proses.
FFMPEG_LOCATION = os.environ.get("FFMPEG_LOCATION", "").strip()

VIDEO_MAX_HEIGHT = int(os.environ.get("VIDEO_MAX_HEIGHT", "1080"))
SOCIAL_MAX_BYTES = int(os.environ.get("SOCIAL_MAX_BYTES", str(200 * 1024 * 1024)))
TEMP_PREFIX = "omnitools-"
TEMP_MAX_AGE = 3600  # detik

# Daftar domain tertutup. Selain membatasi cakupan fitur, ini mencegah endpoint
# dipakai sebagai proxy ke host internal (SSRF).
# Threads sengaja tidak ada: yt-dlp tidak punya extractor untuk threads.net
# maupun threads.com, jadi berapa kali pun dicoba hasilnya "Unsupported URL".
SOCIAL_HOSTS = {
    "instagram": ("instagram.com", "www.instagram.com", "instagr.am"),
    "tiktok": ("tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"),
    "youtube": ("youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"),
    "facebook": ("facebook.com", "www.facebook.com", "fb.watch", "web.facebook.com"),
}
SOCIAL_LABELS = {
    "instagram": "Instagram",
    "tiktok": "TikTok",
    "youtube": "YouTube",
    "facebook": "Facebook",
}

# Pesan mentah yt-dlp berbahasa Inggris dan menyebut flag baris perintah yang
# tidak ada artinya di antarmuka web. Dipetakan ke sebab yang bisa
# ditindaklanjuti user.
YTDLP_ERROR_MAP = [
    (
        ("rate-limit", "rate limit", "redirected to the login page"),
        "{platform} sedang membatasi akses tanpa login. Tunggu beberapa menit lalu coba lagi.",
    ),
    (
        ("sign in to confirm", "not a bot", "captcha"),
        "{platform} meminta verifikasi bahwa permintaan ini bukan robot. Coba lagi beberapa saat lagi.",
    ),
    (
        ("login required", "requires authentication", "private", "not available to you", "age-restricted"),
        "Konten ini tidak publik, jadi tidak bisa diambil tanpa akun yang punya akses.",
    ),
    (
        ("unavailable", "has been removed", "no longer available", "not found", "does not exist"),
        "Konten tidak ditemukan. Mungkin sudah dihapus, atau linknya keliru.",
    ),
    (
        ("ffmpeg is not installed", "ffmpeg not found", "requested merging of multiple formats"),
        "Server tidak menemukan ffmpeg, jadi video beresolusi tinggi tidak bisa disatukan. "
        "Coba lagi untuk mengambil versi kualitas standar.",
    ),
    (
        ("unsupported url",),
        "Link ini belum didukung. Pastikan linknya mengarah langsung ke satu video atau post.",
    ),
    (
        ("available in your country", "in your country", "geo restriction", "geo-restricted"),
        "Konten dibatasi untuk wilayah tertentu dan tidak bisa diakses dari server ini.",
    ),
    (
        ("unable to download webpage", "connection", "timed out", "failed to resolve"),
        "Server tidak berhasil menghubungi {platform}. Periksa koneksi lalu coba lagi.",
    ),
]


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, **extra):
        super().__init__(message)
        self.message = message
        self.status = status
        self.extra = extra


def fail(message: str, status: int = 400, **extra):
    raise ApiError(message, status, **extra)


# --------------------------------------------------------------------------- #
# CORS — frontend ada di domain lain, jadi header ini wajib
# --------------------------------------------------------------------------- #


@app.after_request
def apply_cors(response: Response) -> Response:
    origin = request.headers.get("Origin", "").rstrip("/")
    if origin and (not ALLOWED_ORIGINS or origin in ALLOWED_ORIGINS):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Max-Age"] = "86400"
        # Tanpa ini, JavaScript di frontend tidak bisa membaca nama berkas dari
        # Content-Disposition — unduhannya akan tersimpan dengan nama acak.
        response.headers["Access-Control-Expose-Headers"] = "Content-Disposition"
    response.headers.add("Vary", "Origin")
    return response


# --------------------------------------------------------------------------- #
# Helper
# --------------------------------------------------------------------------- #


def get_ytdlp():
    try:
        import yt_dlp

        return yt_dlp
    except ImportError:
        return None


def ffmpeg_path():
    """Lokasi ffmpeg bila terlihat oleh proses ini, kalau tidak None.

    Dicek per request, bukan sekali saat import: PATH proses tidak selalu sama
    dengan PATH terminal tempat kita mengeceknya.
    """
    if FFMPEG_LOCATION:
        return FFMPEG_LOCATION
    return shutil.which("ffmpeg")


def detect_platform(url: str):
    try:
        parsed = urlparse(url)
    except ValueError:
        return None, None
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None, None
    host = parsed.netloc.split("@")[-1].split(":")[0].lower()
    for key, hosts in SOCIAL_HOSTS.items():
        if host in hosts:
            return key, host
    return None, host


def require_social(url: str):
    ytdlp = get_ytdlp()
    if ytdlp is None:
        fail("Downloader belum aktif di server ini (yt-dlp tidak terpasang).", status=503)

    platform, host = detect_platform(url)
    if platform is None:
        supported = ", ".join(SOCIAL_LABELS.values())
        fail(
            f"Link dari {host or 'domain ini'} belum didukung. Platform tersedia: {supported}.",
            field="url",
        )
    return ytdlp, platform


def base_ytdlp_opts():
    opts = {"quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True}
    if YTDLP_COOKIES_FILE:
        opts["cookiefile"] = YTDLP_COOKIES_FILE
    elif YTDLP_COOKIES_BROWSER:
        opts["cookiesfrombrowser"] = (YTDLP_COOKIES_BROWSER,)
    lokasi = ffmpeg_path()
    if lokasi:
        # Diberikan eksplisit supaya yt-dlp tetap menemukannya walau PATH
        # proses berbeda dari PATH terminal.
        opts["ffmpeg_location"] = lokasi
    return opts


def video_selector(tersedia_ffmpeg: bool) -> str:
    """Pilih format sesuai kemampuan server.

    YouTube menyimpan resolusi tinggi sebagai aliran video dan audio terpisah,
    dan menyatukannya butuh ffmpeg. Tanpa ffmpeg, meminta `bv*+ba` membuat
    unduhan gagal total; lebih baik turun ke format progressive yang sudah
    menyatu.
    """
    h = VIDEO_MAX_HEIGHT
    if tersedia_ffmpeg:
        return f"bv*[height<={h}]+ba/b[height<={h}]/bv*+ba/b"
    return f"b[height<={h}]/b"


def deliverable_height(formats, tersedia_ffmpeg: bool) -> int:
    """Resolusi yang benar-benar akan dikirim, bukan resolusi tertinggi sumber."""
    if tersedia_ffmpeg:
        kandidat = [f.get("height") or 0 for f in formats if f.get("vcodec") not in (None, "none")]
    else:
        kandidat = [
            f.get("height") or 0
            for f in formats
            if f.get("vcodec") not in (None, "none") and f.get("acodec") not in (None, "none")
        ]
    tinggi = max(kandidat, default=0)
    return min(tinggi, VIDEO_MAX_HEIGHT) if tinggi else 0


def friendly_download_error(exc, platform: str | None = None) -> str:
    label = SOCIAL_LABELS.get(platform or "", "Platform ini")
    mentah = " ".join(str(exc).split())
    rendah = mentah.lower()

    for kunci, pesan in YTDLP_ERROR_MAP:
        if any(k in rendah for k in kunci):
            return pesan.format(platform=label)

    bersih = re.sub(r"^ERROR:\s*", "", mentah)
    bersih = re.sub(r"^\[[^\]]+\]\s*[\w.-]+:\s*", "", bersih)
    bersih = re.sub(r"\s*(Use --cookies\b.*|See https?://\S+.*)$", "", bersih).strip()
    return bersih[:200] or f"{label} tidak bisa dibaca saat ini."


def human_duration(seconds):
    if not seconds:
        return None
    seconds = int(seconds)
    minutes, secs = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def sweep_stale_downloads():
    """Jaring pengaman untuk folder unduhan yang tertinggal karena koneksi putus."""
    root = tempfile.gettempdir()
    cutoff = time.time() - TEMP_MAX_AGE
    try:
        names = os.listdir(root)
    except OSError:  # pragma: no cover
        return
    for name in names:
        if not name.startswith(TEMP_PREFIX):
            continue
        path = os.path.join(root, name)
        try:
            if os.path.isdir(path) and os.path.getmtime(path) < cutoff:
                shutil.rmtree(path, ignore_errors=True)
        except OSError:  # pragma: no cover
            continue


def pick_downloaded_file(info, workdir):
    """Tentukan berkas final hasil unduhan.

    Memilih berkas terbesar saja salah: saat yt-dlp menggabungkan video dan
    audio, sisa potongan seperti `.part` atau `.f137.mp4` bisa lebih besar
    daripada hasil gabungannya, dan user menerima berkas setengah jadi.
    """
    for entry in info.get("requested_downloads") or []:
        candidate = entry.get("filepath") or entry.get("_filename")
        if candidate and os.path.isfile(candidate) and os.path.getsize(candidate) > 0:
            return candidate

    leftovers = (".part", ".ytdl", ".temp", ".tmp")
    files = []
    for name in os.listdir(workdir):
        path = os.path.join(workdir, name)
        if not os.path.isfile(path) or os.path.getsize(path) == 0:
            continue
        if name.lower().endswith(leftovers):
            continue
        files.append(path)
    return max(files, key=os.path.getsize) if files else None


# --------------------------------------------------------------------------- #
# Endpoint
# --------------------------------------------------------------------------- #


@app.get("/")
def health():
    """Dipakai Render untuk health check, sekaligus penanda service hidup."""
    return jsonify({"service": "omnitools-downloader", "ok": True})


@app.get("/api/status")
def api_status():
    return jsonify(
        {
            "social": get_ytdlp() is not None,
            "ffmpeg": ffmpeg_path() is not None,
            "platforms": SOCIAL_LABELS,
            "max_height": VIDEO_MAX_HEIGHT,
        }
    )


@app.post("/api/social/resolve")
def api_social_resolve():
    payload = request.get_json(silent=True) or {}
    url = (payload.get("url") or "").strip()
    if not url:
        fail("Link video belum diisi.", field="url")

    ytdlp, platform = require_social(url)

    try:
        with ytdlp.YoutubeDL({**base_ytdlp_opts(), "skip_download": True}) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        fail(friendly_download_error(exc, platform), status=502, field="url")

    if info.get("_type") == "playlist":
        entries = [entry for entry in (info.get("entries") or []) if entry]
        if not entries:
            fail("Tidak ada media yang bisa diambil dari link tersebut.", status=502, field="url")
        info = entries[0]

    formats = info.get("formats") or []
    has_audio = any(fmt.get("acodec") not in (None, "none") for fmt in formats)
    punya_ffmpeg = ffmpeg_path() is not None
    height = deliverable_height(formats, punya_ffmpeg)

    if formats:
        # Tanpa ffmpeg, video yang hanya tersedia sebagai aliran terpisah tidak
        # bisa dikirim sama sekali. Melaporkan resolusi sumbernya sama saja
        # menjanjikan unduhan yang sudah pasti gagal.
        bisa_video = height > 0
    else:
        bisa_video = info.get("vcodec") not in (None, "none") or bool(info.get("height"))
        height = min(info.get("height") or 0, VIDEO_MAX_HEIGHT)

    catatan = None
    if not bisa_video and has_audio and not punya_ffmpeg:
        catatan = (
            "Video ini hanya tersedia sebagai aliran video dan audio terpisah, dan server "
            "belum punya ffmpeg untuk menyatukannya. Audionya tetap bisa diunduh."
        )

    return jsonify(
        {
            "success": True,
            "platform": platform,
            "platform_label": SOCIAL_LABELS.get(platform, platform.title()),
            "title": info.get("title") or "Media tanpa judul",
            "uploader": info.get("uploader") or info.get("channel") or info.get("uploader_id"),
            "thumbnail": info.get("thumbnail"),
            "duration": human_duration(info.get("duration")),
            "quality": f"{height}p" if height else None,
            "has_video": bisa_video,
            "has_audio": has_audio,
            "merged": punya_ffmpeg,
            "note": catatan,
            "webpage_url": info.get("webpage_url") or url,
        }
    )


@app.post("/api/social/download")
def api_social_download():
    payload = request.get_json(silent=True) or {}
    url = (payload.get("url") or "").strip()
    mode = "audio" if payload.get("mode") == "audio" else "video"
    if not url:
        fail("Link video belum diisi.", field="url")

    ytdlp, platform = require_social(url)

    sweep_stale_downloads()
    workdir = tempfile.mkdtemp(prefix=TEMP_PREFIX)

    selector = "bestaudio/best" if mode == "audio" else video_selector(ffmpeg_path() is not None)
    opts = {
        **base_ytdlp_opts(),
        "format": selector,
        "max_filesize": SOCIAL_MAX_BYTES,
        "outtmpl": os.path.join(workdir, "%(id)s.%(ext)s"),
    }

    try:
        with ytdlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as exc:
        shutil.rmtree(workdir, ignore_errors=True)
        fail(friendly_download_error(exc, platform), status=502, field="url")

    path = pick_downloaded_file(info, workdir)
    if path is None:
        shutil.rmtree(workdir, ignore_errors=True)
        fail(
            "Server tidak menerima berkas yang utuh. Coba lagi, atau pakai link dengan "
            "durasi/resolusi lebih kecil.",
            status=502,
        )

    title = re.sub(r"[^\w\s.-]", "", info.get("title") or "omnitools").strip() or "omnitools"
    title = re.sub(r"\s+", "-", title)[:60]
    extension = os.path.splitext(path)[1] or (".m4a" if mode == "audio" else ".mp4")

    response = send_file(path, as_attachment=True, download_name=f"{title}{extension}", max_age=0)

    # Dua jebakan sekaligus:
    # 1. after_this_request berjalan saat respons dibentuk, sebelum berkasnya
    #    terkirim — rmtree lalu gagal karena file masih terbuka.
    # 2. call_on_close saja juga tidak cukup: send_file menyalakan
    #    direct_passthrough, dan pada jalur itu Werkzeug mengembalikan file
    #    wrapper apa adanya tanpa ClosingIterator, sehingga Response.close()
    #    tidak pernah dipanggil.
    # Mematikan direct_passthrough mengembalikan ClosingIterator; isinya tetap
    # dialirkan per potongan, tidak dimuat ke memori.
    response.direct_passthrough = False
    response.call_on_close(lambda: shutil.rmtree(workdir, ignore_errors=True))
    return response


# --------------------------------------------------------------------------- #
# Error handler — API ini selalu membalas JSON
# --------------------------------------------------------------------------- #


@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    return jsonify({"success": False, "error": exc.message, **exc.extra}), exc.status


@app.errorhandler(404)
def handle_not_found(_exc):
    return jsonify({"success": False, "error": "Endpoint tidak ditemukan."}), 404


@app.errorhandler(Exception)
def handle_unexpected(exc):
    """Jaring terakhir supaya klien tidak pernah menerima HTML."""
    if isinstance(exc, HTTPException):
        return exc
    app.logger.exception("Kesalahan tak tertangani pada %s %s", request.method, request.path)
    pesan = f"{type(exc).__name__}: {exc}" if app.debug else "Terjadi kesalahan di server."
    return jsonify({"success": False, "error": pesan}), 500


if (YTDLP_COOKIES_FILE or YTDLP_COOKIES_BROWSER) and not ALLOWED_ORIGINS:
    app.logger.warning(
        "Cookies diisi tapi ALLOWED_ORIGINS kosong: siapa pun bisa memakai sesi login ini. "
        "Isi ALLOWED_ORIGINS dengan domain frontend kamu."
    )


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5001)))
