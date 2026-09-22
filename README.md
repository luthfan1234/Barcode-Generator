# OmniTools

Generator QR Code, generator barcode, penghapus background foto, dan penyimpan
konten sosial media — dalam satu halaman.

```
frontend/   Next.js + TypeScript  →  Vercel   (statis, tanpa serverless function)
backend/    Flask + yt-dlp        →  Render   (24 MB)
```

## Kenapa dipisah

Tiga dari empat alat berjalan **sepenuhnya di browser**, jadi tidak butuh server
sama sekali:

| Alat | Pustaka | Berjalan di |
| --- | --- | --- |
| QR Code | `qrcode` | Browser |
| Barcode | `bwip-js` | Browser |
| Remove BG | `@imgly/background-removal` (ONNX via WASM) | Browser |
| Downloader | `yt-dlp` | Server |

Downloader tidak bisa ikut ke browser: platform sosial media tidak mengizinkan
pengambilan lintas domain (diblokir CORS), dan tidak ada padanan yt-dlp yang
berjalan di browser.

Pemisahan ini juga yang membuat Remove BG bisa dipakai di Vercel. Versi Python
dari fitur itu butuh 463 MB (OpenCV, SciPy, ONNX Runtime, dan model 168 MB),
jauh melewati batas 250 MB per function. Sebagai WASM di browser, modelnya
sekitar 45 MB, diunduh sekali lalu disimpan di cache peramban.

## Menjalankan secara lokal

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local     # isi seperlunya, boleh dikosongkan dulu
npm run dev                    # http://localhost:3000
```

**Backend** (hanya kalau ingin memakai Downloader)

```bash
cd backend
pip install -r requirements.txt
python app.py                  # http://localhost:5001
```

Lalu isi `frontend/.env.local`:

```
NEXT_PUBLIC_DOWNLOADER_API=http://localhost:5001
```

## Deploy

### 1. Backend ke Render

Render membaca `backend/render.yaml`. Yang perlu diatur:

| Pengaturan | Nilai |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn app:app --workers 1 --threads 4 --timeout 600` |

Environment variable:

| Nama | Wajib | Keterangan |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | ya | Domain frontend, dipisah koma. Contoh: `https://omnitools.vercel.app,https://omnitools.com` |
| `YTDLP_COOKIES_FILE` | tidak | Path berkas cookies Netscape. Pakai fitur *Secret Files* Render. Membantu saat Instagram membatasi akses anonim. |
| `FFMPEG_LOCATION` | tidak | Hanya kalau ffmpeg ada tapi tidak masuk PATH. |
| `VIDEO_MAX_HEIGHT` | tidak | Bawaan `1080`. |

Catat alamat yang diberikan Render, misalnya
`https://omnitools-downloader.onrender.com`.

### 2. Frontend ke Vercel

| Pengaturan | Nilai |
| --- | --- |
| Root Directory | `frontend` |
| Framework | Next.js (terdeteksi otomatis) |

Environment variable:

| Nama | Keterangan |
| --- | --- |
| `NEXT_PUBLIC_DOWNLOADER_API` | Alamat backend Render tadi. Kalau dikosongkan, tab Downloader menampilkan keterangan belum dikonfigurasi dan tiga alat lainnya tetap berfungsi penuh. |

**Domain tidak perlu diatur.** Vercel mengisi `VERCEL_PROJECT_PRODUCTION_URL`
sendiri, dan nilainya otomatis ikut berubah begitu domain kustom dipasang —
`canonical`, `og:url`, dan `sitemap.xml` langsung menyesuaikan. Deploy pratinjau
otomatis diberi `noindex` supaya tidak dianggap duplikat produksi.

Variabel dibaca saat build, jadi **deploy ulang** setelah mengubahnya.

### 3. Setelah domain dipasang

1. Tambahkan domain itu ke `ALLOWED_ORIGINS` di Render, lalu deploy ulang Vercel.
2. Daftarkan `https://domainmu.com/sitemap.xml` di Google Search Console.

## Yang perlu diketahui

- **Render tier gratis tidur** setelah 15 menit menganggur; permintaan pertama
  setelah itu menunggu sekitar 50 detik. Frontend sudah menjelaskan ini kalau
  permintaannya gagal.
- **Blokir IP tidak hilang karena pindah host.** Render juga datacenter, jadi
  Instagram tetap bisa membatasi akses anonim. Yang benar-benar menolong hanya
  cookies atau IP yang tidak dikenali sebagai datacenter.
- **Remove BG memakai prosesor pengunjung.** Perangkat lawas akan terasa lambat,
  dan unduhan model 45 MB pertama kali terasa di koneksi lambat.
- **Threads tidak didukung** karena yt-dlp tidak punya extractor untuk
  threads.net maupun threads.com.

## Struktur

```
frontend/
  app/
    layout.tsx      metadata, font, provider toast
    page.tsx        susunan halaman + JSON-LD
    globals.css     seluruh design system
    robots.ts  sitemap.ts
  components/
    Segmented.tsx   tab dengan indikator clip-path
    Tools.tsx       pengatur tab aktif
    QrStudio.tsx  BarcodeStudio.tsx  RemoveBg.tsx  Downloader.tsx
    CompareSlider.tsx  Faq.tsx  Sections.tsx  Reveal.tsx  Toast.tsx
  lib/
    qr.ts  barcode.ts  api.ts  clipboard.ts  faq.ts
backend/
  app.py  requirements.txt  render.yaml
```

`lib/faq.ts` adalah satu-satunya sumber data FAQ: dipakai merender accordion
sekaligus structured data JSON-LD, supaya keduanya tidak pernah berbeda isinya.
