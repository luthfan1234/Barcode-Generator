"""OmniTools — QR Code, Barcode, Social Downloader, dan Remove Background.

Semua tool di sini benar-benar diproses di server. Fitur yang bergantung pada
dependensi opsional (rembg, yt-dlp) dilaporkan lewat /api/status supaya UI bisa
menampilkan statusnya apa adanya, bukan pura-pura berhasil.
"""

from __future__ import annotations

import base64
import importlib.util
import io
import os
import re
import shutil
import tempfile
import threading
import time
from urllib.parse import urlparse

import barcode
import qrcode
from barcode.writer import ImageWriter
from flask import Flask, Response, jsonify, render_template, request, send_file

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB

# --------------------------------------------------------------------------- #
# Konstanta & aturan validasi
# --------------------------------------------------------------------------- #

HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

QR_MAX_CHARS = 2000
QR_ERROR_LEVELS = {
    "L": qrcode.constants.ERROR_CORRECT_L,
    "M": qrcode.constants.ERROR_CORRECT_M,
    "Q": qrcode.constants.ERROR_CORRECT_Q,
    "H": qrcode.constants.ERROR_CORRECT_H,
}

# type -> (nama class python-barcode, pola valid, pesan bantuan)
BARCODE_RULES = {
    "code128": (
        "code128",
        re.compile(r"^[\x20-\x7e]{1,48}$"),
        "Code 128 menerima huruf, angka, dan simbol ASCII (1-48 karakter).",
    ),
    "code39": (
        "code39",
        re.compile(r"^[0-9A-Z\-. $/+%]{1,43}$"),
        "Code 39 hanya menerima HURUF KAPITAL, angka, dan simbol - . spasi $ / + %",
    ),
    "ean13": (
        "ean13",
        re.compile(r"^\d{12,13}$"),
        "EAN-13 butuh 12 digit angka (check digit dihitung otomatis) atau 13 digit lengkap.",
    ),
    "ean8": (
        "ean8",
        re.compile(r"^\d{7,8}$"),
        "EAN-8 butuh 7 digit angka (check digit dihitung otomatis) atau 8 digit lengkap.",
    ),
    "upca": (
        "upca",
        re.compile(r"^\d{11,12}$"),
        "UPC-A butuh 11 digit angka (check digit dihitung otomatis) atau 12 digit lengkap.",
    ),
    "isbn13": (
        "isbn13",
        re.compile(r"^97[89]\d{9,10}$"),
        "ISBN-13 harus diawali 978 atau 979 dan terdiri dari 12-13 digit.",
    ),
    "itf": (
        "itf",
        re.compile(r"^\d{2,30}$"),
        "ITF (Interleaved 2 of 5) hanya menerima angka dengan jumlah digit genap.",
    ),
}
BARCODE_ALIASES = {"upc": "upca", "upc-a": "upca", "code-128": "code128", "code-39": "code39"}

# Daftar domain tertutup untuk downloader. Selain membatasi cakupan fitur, ini
# mencegah endpoint dipakai sebagai proxy ke host internal (SSRF).
# Threads sengaja tidak ada di sini: yt-dlp tidak punya extractor untuk
# threads.net maupun threads.com, jadi berapa kali pun dicoba hasilnya
# "Unsupported URL". Mencantumkannya sama saja menjanjikan yang tidak ada.
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

# Cookies opsional, mati secara bawaan. Instagram dan Facebook membatasi akses
# anonim dengan cepat; mengisi salah satu variabel ini membuat yt-dlp memakai
# sesi login yang sudah ada.
#   YTDLP_COOKIES_FILE=/path/cookies.txt      (format Netscape)
#   YTDLP_COOKIES_FROM_BROWSER=chrome         (chrome/firefox/edge/brave/...)
YTDLP_COOKIES_FILE = os.environ.get("YTDLP_COOKIES_FILE", "").strip()
YTDLP_COOKIES_BROWSER = os.environ.get("YTDLP_COOKIES_FROM_BROWSER", "").strip()

# Pesan mentah yt-dlp berbahasa Inggris dan menyebut flag baris perintah yang
# tidak ada artinya di antarmuka web. Dipetakan dulu ke sebab yang bisa
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
        ("unsupported url",),
        "Link ini belum didukung. Pastikan linknya mengarah langsung ke satu video atau post.",
    ),
    (
        # "available in your country" saja, karena kalimat aslinya bervariasi:
        # "...has not made this video available in your country" dan
        # "The uploader has blocked it in your country".
        ("available in your country", "in your country", "geo restriction", "geo-restricted"),
        "Konten dibatasi untuk wilayah tertentu dan tidak bisa diakses dari server ini.",
    ),
    (
        ("unable to download webpage", "connection", "timed out", "failed to resolve"),
        "Server tidak berhasil menghubungi {platform}. Periksa koneksi lalu coba lagi.",
    ),
]

IMAGE_FORMATS = {"PNG", "JPEG", "JPG", "WEBP", "BMP", "TIFF"}
REMOVEBG_MAX_BYTES = 15 * 1024 * 1024
REMOVEBG_MAX_EDGE = 2000  # sisi terpanjang; ditekan dulu agar inferensi tidak lama
SOCIAL_MAX_BYTES = 200 * 1024 * 1024
TEMP_PREFIX = "omnitools-"
TEMP_MAX_AGE = 3600  # detik; jaring pengaman kalau ada unduhan yang terputus
VIDEO_MAX_HEIGHT = 1080

# --------------------------------------------------------------------------- #
# SEO
# --------------------------------------------------------------------------- #

# Diisi lewat environment variable setelah domainnya ada, misal:
#   SITE_URL=https://omnitools.vercel.app
# Selama kosong, canonical dan og:url sengaja tidak dirender: URL absolut yang
# salah lebih merugikan untuk SEO daripada tidak ada sama sekali.
SITE_URL = os.environ.get("SITE_URL", "").strip().rstrip("/")

SITE_NAME = "OmniTools"
SITE_TAGLINE = "Generator QR Code, Barcode & Hapus Background Foto"
SITE_DESCRIPTION = (
    "Buat QR Code dan barcode online gratis, hapus background foto jadi PNG "
    "transparan, dan simpan video sosial media. Langsung jadi di browser."
)

# Satu sumber data untuk FAQ: dipakai merender accordion sekaligus structured
# data. Google menganggap structured data yang isinya tidak sama dengan yang
# terlihat di halaman sebagai pelanggaran, jadi keduanya tidak boleh terpisah.
FAQ_ITEMS = [
    {
        "id": "faq-1",
        "question": "Data saya dikirim ke pihak ketiga?",
        "answer": [
            "QR Code, barcode, dan penghapusan background semuanya diproses oleh "
            "OmniTools sendiri, bukan dititipkan ke layanan lain. Gambar yang kamu "
            "unggah dipakai sekali untuk diproses lalu dilepas, tidak disimpan.",
        ],
    },
    {
        "id": "faq-2",
        "question": "Kenapa tab Downloader atau Remove BG kadang mati?",
        "answer": [
            "Keduanya butuh paket tambahan yang sifatnya opsional. Halaman ini "
            "menanyakan status sebenarnya ke server saat dimuat, jadi kalau paketnya "
            "belum ada, tabnya mengatakan itu apa adanya, bukan gagal diam-diam.",
            "Downloader butuh <code>yt-dlp</code>, penghapus background butuh "
            "<code>rembg</code> dan <code>onnxruntime</code>.",
        ],
    },
    {
        "id": "faq-3",
        "question": "Simbologi barcode mana yang harus saya pilih?",
        "answer": [
            "Kalau kodenya mengandung huruf atau tanda baca, pakai <b>Code 128</b>. "
            "Untuk produk ritel yang didaftarkan resmi, pakai <b>EAN-13</b> (12 digit, "
            "digit ke-13 dihitung otomatis) atau <b>UPC-A</b> untuk pasar Amerika.",
            "Kalau kamu salah pilih, pesan errornya menyebutkan aturan formatnya dan "
            "menawarkan tombol untuk pindah ke Code 128.",
        ],
    },
    {
        "id": "faq-4",
        "question": "Kenapa hapus background pertama kali terasa lama?",
        "answer": [
            "Model pemisah background dimuat ke memori saat pertama dipakai. Setelah "
            "itu model yang sama dipakai ulang, jadi gambar berikutnya diproses jauh "
            "lebih cepat. Gambar yang sangat besar juga dikecilkan dulu ke sisi "
            "terpanjang 2000 piksel.",
        ],
    },
    {
        "id": "faq-5",
        "question": "Ada batas ukuran file?",
        "answer": [
            "Foto untuk hapus background maksimal 15 MB. Teks QR Code maksimal 2000 "
            "karakter. Unduhan video dibatasi 1080p dan 200 MB supaya tidak "
            "menggantung terlalu lama.",
        ],
    },
]


def build_structured_data():
    """Structured data schema.org untuk hasil pencarian yang lebih kaya."""
    aplikasi = {
        "@type": "WebApplication",
        "name": SITE_NAME,
        "description": SITE_DESCRIPTION,
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "Any",
        "inLanguage": "id-ID",
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "IDR"},
        "featureList": [
            "Generator QR Code dengan pilihan warna dan koreksi error",
            "Generator barcode Code 128, EAN-13, EAN-8, UPC-A, Code 39, ISBN-13, ITF",
            "Hapus background foto menjadi PNG transparan",
            "Simpan video dan audio dari sosial media",
        ],
    }
    if SITE_URL:
        aplikasi["url"] = SITE_URL + "/"

    faq = {
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": item["question"],
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": " ".join(item["answer"]),
                },
            }
            for item in FAQ_ITEMS
        ],
    }
    return {"@context": "https://schema.org", "@graph": [aplikasi, faq]}


class ApiError(Exception):
    """Error yang pesannya sudah siap ditampilkan ke user."""

    def __init__(self, message: str, status: int = 400, **extra):
        super().__init__(message)
        self.message = message
        self.status = status
        self.extra = extra


def fail(message: str, status: int = 400, **extra):
    raise ApiError(message, status, **extra)


def clamp(value, low, high, default):
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def clean_color(value, fallback: str) -> str:
    if isinstance(value, str) and HEX_COLOR.match(value.strip()):
        return value.strip()
    return fallback


def png_data_url(image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


# --------------------------------------------------------------------------- #
# Dependensi opsional
# --------------------------------------------------------------------------- #

_rembg_session = None
_rembg_lock = threading.Lock()


def rembg_available() -> bool:
    return importlib.util.find_spec("rembg") is not None


def get_rembg_session():
    """Model rembg berat untuk di-load, jadi session-nya dipakai ulang."""
    global _rembg_session
    if _rembg_session is None:
        with _rembg_lock:
            if _rembg_session is None:
                from rembg import new_session

                _rembg_session = new_session(os.environ.get("REMBG_MODEL", "u2net"))
    return _rembg_session


def get_ytdlp():
    try:
        import yt_dlp

        return yt_dlp
    except ImportError:
        return None


def detect_platform(url: str):
    """Kembalikan (kunci platform, host) bila URL termasuk domain yang didukung."""
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


# --------------------------------------------------------------------------- #
# Halaman & status
# --------------------------------------------------------------------------- #


@app.get("/")
def index():
    return render_template(
        "index.html",
        site_url=SITE_URL,
        faq_items=FAQ_ITEMS,
        structured_data=build_structured_data(),
    )


def base_url() -> str:
    """URL absolut situs: dari SITE_URL bila diisi, kalau tidak dari request.

    robots.txt dan sitemap.xml harus selalu menyebut URL yang benar, jadi
    keduanya jatuh ke host request supaya tetap jalan sejak deploy pertama —
    beda dari canonical, yang memang sengaja dikosongkan sampai domainnya pasti.
    """
    return SITE_URL or request.url_root.rstrip("/")


@app.get("/robots.txt")
def robots_txt():
    baris = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",  # endpoint JSON tidak ada gunanya di hasil pencarian
        "",
        f"Sitemap: {base_url()}/sitemap.xml",
        "",
    ]
    return Response("\n".join(baris), mimetype="text/plain")


@app.get("/sitemap.xml")
def sitemap_xml():
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        "  <url>\n"
        f"    <loc>{base_url()}/</loc>\n"
        "    <changefreq>monthly</changefreq>\n"
        "    <priority>1.0</priority>\n"
        "  </url>\n"
        "</urlset>\n"
    )
    return Response(xml, mimetype="application/xml")


@app.get("/api/status")
def api_status():
    """Dipakai UI untuk tahu tool mana yang benar-benar siap di mesin ini."""
    return jsonify(
        {
            "qr": True,
            "barcode": True,
            "removebg": rembg_available(),
            "social": get_ytdlp() is not None,
            "hints": {
                "removebg": "pip install rembg onnxruntime",
                "social": "pip install yt-dlp",
            },
        }
    )


# --------------------------------------------------------------------------- #
# QR Code
# --------------------------------------------------------------------------- #


@app.post("/api/qr")
def api_qr():
    payload = request.get_json(silent=True) or {}
    data = (payload.get("data") or "").strip()

    if not data:
        fail("Teks atau URL belum diisi.", field="data")
    if len(data) > QR_MAX_CHARS:
        fail(f"Teks terlalu panjang ({len(data)} karakter). Maksimal {QR_MAX_CHARS}.", field="data")

    fill = clean_color(payload.get("fill_color"), "#0f172a")
    back = clean_color(payload.get("back_color"), "#ffffff")
    if fill.lower() == back.lower():
        fail("Warna QR dan background sama persis, hasilnya tidak akan terbaca.", field="fill_color")

    level = str(payload.get("error_correction", "M")).upper()
    if level not in QR_ERROR_LEVELS:
        level = "M"

    qr = qrcode.QRCode(
        version=None,
        error_correction=QR_ERROR_LEVELS[level],
        box_size=clamp(payload.get("box_size", 10), 4, 24, 10),
        border=clamp(payload.get("border", 3), 1, 8, 3),
    )
    qr.add_data(data)

    try:
        qr.make(fit=True)
        image = qr.make_image(fill_color=fill, back_color=back).convert("RGB")
    except qrcode.exceptions.DataOverflowError:
        fail(
            "Data terlalu padat untuk satu QR Code. Perpendek teks atau turunkan level koreksi error.",
            field="data",
        )
    except ValueError as exc:
        fail(f"Gagal membuat QR Code: {exc}")

    return jsonify(
        {
            "success": True,
            "image_data": png_data_url(image),
            "version": qr.version,
            "error_correction": level,
            "size": image.width,
            "chars": len(data),
        }
    )


# --------------------------------------------------------------------------- #
# Barcode
# --------------------------------------------------------------------------- #


@app.post("/api/barcode")
def api_barcode():
    payload = request.get_json(silent=True) or {}
    raw = (payload.get("data") or "").strip()
    if not raw:
        fail("Kode barcode belum diisi.", field="data")

    requested = str(payload.get("type", "code128")).lower()
    code_type = BARCODE_ALIASES.get(requested, requested)
    if code_type not in BARCODE_RULES:
        code_type = "code128"

    class_name, pattern, help_text = BARCODE_RULES[code_type]
    value = raw.upper() if code_type == "code39" else raw

    # Divalidasi lebih dulu dengan pesan yang jelas, bukan diam-diam diganti
    # simbologinya seperti sebelumnya.
    can_fallback = code_type != "code128" and bool(BARCODE_RULES["code128"][1].match(value))
    if not pattern.match(value):
        fail(help_text, field="data", code_type=code_type, fallback="code128" if can_fallback else None)
    if code_type == "itf" and len(value) % 2:
        fail(
            "ITF butuh jumlah digit genap.",
            field="data",
            code_type=code_type,
            fallback="code128" if can_fallback else None,
        )

    options = {
        "write_text": bool(payload.get("show_text", True)),
        "quiet_zone": clamp(payload.get("quiet_zone", 3), 1, 12, 3),
        "module_height": clamp(payload.get("height", 14), 6, 30, 14),
        "font_size": clamp(payload.get("font_size", 10), 6, 18, 10),
        "text_distance": 3.5,
        "foreground": clean_color(payload.get("fill_color"), "#0f172a"),
        "background": clean_color(payload.get("back_color"), "#ffffff"),
    }

    try:
        instance = barcode.get_barcode_class(class_name)(value, writer=ImageWriter())
        buffer = io.BytesIO()
        instance.write(buffer, options=options)
    except barcode.errors.BarcodeError as exc:
        fail(
            f"{help_text} ({exc})",
            field="data",
            code_type=code_type,
            fallback="code128" if can_fallback else None,
        )
    except Exception as exc:  # pragma: no cover - jaring pengaman writer/PIL
        fail(f"Gagal membuat barcode: {exc}", status=500)

    full_code = instance.get_fullcode()
    return jsonify(
        {
            "success": True,
            "image_data": "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"),
            "type": code_type,
            "code": full_code,
            # Untuk EAN/UPC check digit dihitung di server, jadi beri tahu kalau
            # hasil akhirnya berbeda dari yang diketik user.
            "adjusted": full_code != value,
        }
    )


# --------------------------------------------------------------------------- #
# Remove Background
# --------------------------------------------------------------------------- #


@app.post("/api/remove-bg")
def api_remove_bg():
    if not rembg_available():
        fail("Fitur hapus latar belum aktif di server ini. Jalankan: pip install rembg onnxruntime", status=503)

    upload = request.files.get("image")
    if upload is None or not upload.filename:
        fail("Belum ada gambar yang diunggah.", field="image")

    blob = upload.read()
    if not blob:
        fail("File gambar kosong.", field="image")
    if len(blob) > REMOVEBG_MAX_BYTES:
        fail(f"Ukuran gambar {len(blob) / 1048576:.1f} MB melebihi batas 15 MB.", field="image")

    from PIL import Image, ImageOps, UnidentifiedImageError

    try:
        source = Image.open(io.BytesIO(blob))
        source.load()
    except (UnidentifiedImageError, OSError):
        fail("File tidak dikenali sebagai gambar. Gunakan JPG, PNG, atau WebP.", field="image")

    if source.format and source.format.upper() not in IMAGE_FORMATS:
        fail(f"Format {source.format} belum didukung. Gunakan JPG, PNG, atau WebP.", field="image")

    source = ImageOps.exif_transpose(source).convert("RGBA")
    original_size = source.size
    if max(source.size) > REMOVEBG_MAX_EDGE:
        source.thumbnail((REMOVEBG_MAX_EDGE, REMOVEBG_MAX_EDGE), Image.LANCZOS)

    try:
        from rembg import remove

        result = remove(source, session=get_rembg_session())
    except Exception as exc:  # pragma: no cover - tergantung runtime onnx
        fail(f"Proses hapus latar gagal: {exc}", status=500)

    return jsonify(
        {
            "success": True,
            "image_data": png_data_url(result),
            "width": result.width,
            "height": result.height,
            "original_width": original_size[0],
            "original_height": original_size[1],
            "downscaled": result.size != original_size,
        }
    )


# --------------------------------------------------------------------------- #
# Social downloader
# --------------------------------------------------------------------------- #


def require_social(url: str):
    ytdlp = get_ytdlp()
    if ytdlp is None:
        fail("Downloader belum aktif di server ini. Jalankan: pip install yt-dlp", status=503)

    platform, host = detect_platform(url)
    if platform is None:
        supported = ", ".join(SOCIAL_LABELS.values())
        fail(f"Link dari {host or 'domain ini'} belum didukung. Platform tersedia: {supported}.", field="url")
    return ytdlp, platform


def base_ytdlp_opts():
    opts = {"quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True}
    if YTDLP_COOKIES_FILE:
        opts["cookiefile"] = YTDLP_COOKIES_FILE
    elif YTDLP_COOKIES_BROWSER:
        opts["cookiesfrombrowser"] = (YTDLP_COOKIES_BROWSER,)
    return opts


def friendly_download_error(exc, platform: str | None = None) -> str:
    """Ubah pesan mentah yt-dlp menjadi sebab yang bisa ditindaklanjuti user."""
    label = SOCIAL_LABELS.get(platform or "", "Platform ini")
    mentah = " ".join(str(exc).split())
    rendah = mentah.lower()

    for kunci, pesan in YTDLP_ERROR_MAP:
        if any(k in rendah for k in kunci):
            return pesan.format(platform=label)

    # Tidak dikenali: buang derau khas baris perintah supaya sisanya masih
    # terbaca, daripada melempar seluruh jejak error ke muka user.
    bersih = re.sub(r"^ERROR:\s*", "", mentah)
    bersih = re.sub(r"^\[[^\]]+\]\s*[\w.-]+:\s*", "", bersih)
    bersih = re.sub(r"\s*(Use --cookies\b.*|See https?://\S+.*)$", "", bersih).strip()
    return bersih[:200] or f"{label} tidak bisa dibaca saat ini."


def sweep_stale_downloads():
    """Buang folder unduhan lama yang tertinggal karena koneksi terputus.

    Jalur normal sudah dibersihkan lewat call_on_close; ini hanya jaring
    pengaman supaya folder temp tidak menumpuk diam-diam.
    """
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

    Memilih berkas terbesar di folder itu salah: saat yt-dlp menggabungkan
    video dan audio, sisa potongan seperti `.part` atau `.f137.mp4` bisa lebih
    besar daripada hasil gabungannya, dan user menerima berkas setengah jadi.
    yt-dlp sendiri melaporkan path finalnya, jadi itu yang dipakai lebih dulu.
    """
    for entry in info.get("requested_downloads") or []:
        candidate = entry.get("filepath") or entry.get("_filename")
        if candidate and os.path.isfile(candidate) and os.path.getsize(candidate) > 0:
            return candidate

    # Cadangan: pindai folder, tapi abaikan berkas kerja yt-dlp.
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


def human_duration(seconds):
    if not seconds:
        return None
    seconds = int(seconds)
    minutes, secs = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


@app.post("/api/social/resolve")
def api_social_resolve():
    payload = request.get_json(silent=True) or {}
    url = (payload.get("url") or "").strip()
    if not url:
        fail("Link video belum diisi.", field="url")

    ytdlp, platform = require_social(url)

    opts = {**base_ytdlp_opts(), "skip_download": True}
    try:
        with ytdlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except ytdlp.utils.DownloadError as exc:
        fail(friendly_download_error(exc, platform), status=502, field="url")
    except Exception as exc:  # pragma: no cover
        fail(friendly_download_error(exc, platform), status=502, field="url")

    if info.get("_type") == "playlist":
        entries = [entry for entry in (info.get("entries") or []) if entry]
        if not entries:
            fail("Tidak ada media yang bisa diambil dari link tersebut.", status=502, field="url")
        info = entries[0]

    formats = info.get("formats") or []
    has_audio = any(fmt.get("acodec") not in (None, "none") for fmt in formats)
    height = info.get("height") or max((fmt.get("height") or 0 for fmt in formats), default=0)
    # Yang ditampilkan harus sama dengan yang benar-benar dikirim nanti, bukan
    # resolusi sumber — unduhan video dibatasi VIDEO_MAX_HEIGHT.
    height = min(height, VIDEO_MAX_HEIGHT) if height else 0

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
            "has_video": info.get("vcodec") not in (None, "none") or bool(height),
            "has_audio": has_audio,
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

    # Dibatasi VIDEO_MAX_HEIGHT: sumber 4K bisa tembus batas ukuran dan butuh
    # menit-menit untuk diunduh, padahal bedanya tidak terasa untuk konten
    # sosial. Angka yang sama dipakai saat melaporkan kualitas di /resolve.
    h = VIDEO_MAX_HEIGHT
    selector = (
        "bestaudio/best"
        if mode == "audio"
        else f"bv*[height<={h}]+ba/b[height<={h}]/bv*+ba/b"
    )
    opts = {
        **base_ytdlp_opts(),
        "format": selector,
        "max_filesize": SOCIAL_MAX_BYTES,
        "outtmpl": os.path.join(workdir, "%(id)s.%(ext)s"),
    }

    try:
        with ytdlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except ytdlp.utils.DownloadError as exc:
        shutil.rmtree(workdir, ignore_errors=True)
        fail(friendly_download_error(exc, platform), status=502, field="url")
    except Exception as exc:  # pragma: no cover
        shutil.rmtree(workdir, ignore_errors=True)
        fail(friendly_download_error(exc, platform), status=502, field="url")

    path = pick_downloaded_file(info, workdir)
    if path is None:
        shutil.rmtree(workdir, ignore_errors=True)
        fail(
            "Server tidak menerima berkas yang utuh. Coba lagi, atau pakai link "
            "dengan durasi/resolusi lebih kecil.",
            status=502,
        )
    title = re.sub(r"[^\w\s.-]", "", info.get("title") or "omnitools").strip() or "omnitools"
    title = re.sub(r"\s+", "-", title)[:60]
    extension = os.path.splitext(path)[1] or (".m4a" if mode == "audio" else ".mp4")

    response = send_file(path, as_attachment=True, download_name=f"{title}{extension}", max_age=0)

    # Pembersihan folder temp, dua jebakan sekaligus:
    #
    # 1. after_this_request berjalan saat respons dibentuk, yaitu sebelum
    #    berkasnya terkirim. Di Windows rmtree lalu gagal karena file masih
    #    terbuka, dan foldernya tertinggal setiap kali ada unduhan.
    # 2. call_on_close saja juga tidak cukup: send_file menyalakan
    #    direct_passthrough, dan pada jalur itu Werkzeug mengembalikan file
    #    wrapper apa adanya tanpa ClosingIterator — Response.close() tidak
    #    pernah dipanggil, jadi callback-nya tidak pernah jalan.
    #
    # Mematikan direct_passthrough mengembalikan ClosingIterator (isinya tetap
    # dialirkan per potongan, tidak dimuat ke memori), sehingga close() dan
    # callback di bawah benar-benar dieksekusi setelah berkas selesai dikirim.
    response.direct_passthrough = False
    response.call_on_close(lambda: shutil.rmtree(workdir, ignore_errors=True))
    return response


# --------------------------------------------------------------------------- #
# Error handler — endpoint /api selalu membalas JSON, bukan halaman HTML
# --------------------------------------------------------------------------- #


@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    return jsonify({"success": False, "error": exc.message, **exc.extra}), exc.status


@app.errorhandler(413)
def handle_too_large(_exc):
    return jsonify({"success": False, "error": "File terlalu besar. Maksimal 16 MB per unggahan."}), 413


@app.errorhandler(404)
def handle_not_found(exc):
    if request.path.startswith("/api/"):
        return jsonify({"success": False, "error": "Endpoint tidak ditemukan."}), 404
    return exc


@app.errorhandler(500)
def handle_server_error(exc):  # pragma: no cover
    if request.path.startswith("/api/"):
        return jsonify({"success": False, "error": "Terjadi kesalahan di server."}), 500
    return exc


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
