import {
  ArrowDown, ArrowUp, ImageMinus, Keyboard, MessageSquareWarning, ScanBarcode, Sparkles, Zap,
} from "lucide-react";
import { Reveal } from "./Reveal";

export function Header() {
  return (
    <header className="site-header" id="site-header">
      <div className="site-header__inner">
        <a className="brand" href="#top">OmniTools</a>
        <nav className="site-nav" aria-label="Bagian halaman">
          <a href="#fitur">Fitur</a>
          <a href="#cara-pakai">Cara pakai</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="header-actions">
          <a className="btn btn--primary btn--sm header-cta" href="#alat">Buka alat</a>
        </div>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="hero">
      <p className="hero__eyebrow">
        <Sparkles width={13} height={13} aria-hidden="true" />
        Empat alat, tanpa pindah tab
      </p>
      <h1 className="hero__title">
        Generator QR Code, Barcode, dan <em>hapus background</em>.
      </h1>
      <p className="hero__desc">
        Buat QR Code dan barcode standar industri, hapus background foto jadi PNG transparan,
        dan simpan konten sosial media. Semuanya langsung jadi di browser.
      </p>
      <div className="hero__actions">
        <a className="btn btn--primary" href="#alat">
          <ArrowDown width={16} height={16} aria-hidden="true" />
          Mulai sekarang
        </a>
        <a className="btn btn--ghost" href="#fitur">Lihat fitur</a>
      </div>
    </section>
  );
}

const FITUR = [
  {
    Icon: Zap,
    judul: "Pratinjau langsung",
    teks: "QR Code dan barcode dibuat ulang sambil kamu mengetik. Tanpa tombol kirim, tanpa halaman dimuat ulang.",
  },
  {
    Icon: ScanBarcode,
    judul: "Tujuh simbologi barcode",
    teks: "Code 128, EAN-13, EAN-8, UPC-A, Code 39, ISBN-13, dan ITF. Semua divalidasi dulu, jadi kamu tahu penyebabnya kalau ada yang salah.",
  },
  {
    Icon: ImageMinus,
    judul: "Hapus background di browser",
    teks: "Fotonya diproses di perangkatmu sendiri dan tidak pernah diunggah ke mana pun. Hasilnya PNG transparan.",
  },
  {
    Icon: Sparkles,
    judul: "Tanpa watermark",
    teks: "Hasilnya bersih tanpa tanda air. QR Code, barcode, dan foto transparan langsung bisa dipakai untuk cetak maupun web.",
  },
  {
    Icon: Keyboard,
    judul: "Ramah keyboard",
    teks: "Pindah alat dengan tombol panah, tekan Enter untuk membuat ulang. Perpindahan lewat keyboard sengaja tidak dianimasikan supaya terasa seketika.",
  },
  {
    Icon: MessageSquareWarning,
    judul: "Error yang menjelaskan",
    teks: 'Kalau formatnya salah, yang muncul bukan sekadar "gagal", tapi aturan formatnya plus tombol untuk langsung memperbaikinya.',
  },
];

export function Features() {
  return (
    <section className="section" id="fitur">
      <div className="section__inner">
        <Reveal as="header" className="section__head">
          <p className="section__eyebrow">Fitur</p>
          <h2 className="section__title">Dibuat supaya kamu tidak perlu menunggu</h2>
          <p className="section__desc">
            Tidak ada langkah basa-basi. Ketik, lihat hasilnya, ambil filenya.
          </p>
        </Reveal>

        <ul className="feature-grid reveal-group">
          {FITUR.map(({ Icon, judul, teks }) => (
            <Reveal as="li" className="feature" key={judul}>
              <span className="feature__icon" aria-hidden="true"><Icon width={18} height={18} /></span>
              <h3 className="feature__title">{judul}</h3>
              <p className="feature__desc">{teks}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

const LANGKAH = [
  {
    judul: "Pilih alatnya",
    teks: "Empat tombol di atas: QR Code, Barcode, Downloader, atau Remove BG.",
  },
  {
    judul: "Isi atau tempel",
    teks: "Ketik teksnya, tempel linknya, atau lepas fotonya. Hasilnya muncul sambil kamu mengetik — tidak perlu menekan apa pun.",
  },
  {
    judul: "Unduh atau salin",
    teks: "Simpan sebagai PNG, atau salin langsung ke clipboard untuk ditempel ke dokumen dan chat.",
  },
];

export function Steps() {
  return (
    <section className="section section--alt" id="cara-pakai">
      <div className="section__inner">
        <Reveal as="header" className="section__head">
          <p className="section__eyebrow">Cara pakai</p>
          <h2 className="section__title">Tiga langkah, tidak ada yang tersembunyi</h2>
        </Reveal>

        <ol className="step-grid reveal-group">
          {LANGKAH.map(({ judul, teks }, i) => (
            <Reveal as="li" className="step" key={judul}>
              <span className="step__num" aria-hidden="true">{i + 1}</span>
              <h3 className="step__title">{judul}</h3>
              <p className="step__desc">{teks}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section className="section">
      <div className="section__inner section__inner--narrow">
        <Reveal className="cta">
          <h2 className="cta__title">Sudah siap? Alatnya ada di atas.</h2>
          <p className="cta__desc">Tidak perlu daftar akun. Hasilnya langsung bisa diunduh atau disalin.</p>
          <a className="btn btn--primary" href="#alat">
            <ArrowUp width={16} height={16} aria-hidden="true" />
            Kembali ke alat
          </a>
        </Reveal>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <a className="brand" href="#top">OmniTools</a>
          <p>
            Generator QR Code dan barcode, penghapus background foto, dan penyimpan konten
            sosial media — semuanya dalam satu halaman.
          </p>
        </div>

        <nav className="site-footer__col" aria-label="Alat">
          <h2>Alat</h2>
          <ul>
            <li><a href="#alat">QR Code</a></li>
            <li><a href="#alat">Barcode</a></li>
            <li><a href="#alat">Downloader</a></li>
            <li><a href="#alat">Remove BG</a></li>
          </ul>
        </nav>

        <nav className="site-footer__col" aria-label="Halaman">
          <h2>Halaman</h2>
          <ul>
            <li><a href="#fitur">Fitur</a></li>
            <li><a href="#cara-pakai">Cara pakai</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>
        </nav>
      </div>

      <div className="site-footer__bottom">
        <p>© 2026 OmniTools</p>
        <p>Gunakan downloader hanya untuk konten yang kamu berhak simpan.</p>
      </div>
    </footer>
  );
}
