import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { IS_PREVIEW, SITE_URL } from "@/lib/site";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});


const JUDUL = "OmniTools — Generator QR Code, Barcode & Hapus Background Foto";
const DESKRIPSI =
  "Buat QR Code dan barcode online gratis, hapus background foto jadi PNG transparan, " +
  "dan simpan video sosial media. Langsung jadi di browser, hasilnya siap diunduh.";

export const metadata: Metadata = {
  title: JUDUL,
  description: DESKRIPSI,
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL), alternates: { canonical: "/" } } : {}),
  // Deploy pratinjau tidak diindeks supaya tidak dianggap duplikat produksi.
  robots: IS_PREVIEW
    ? { index: false, follow: false }
    : { index: true, follow: true, "max-image-preview": "large" },
  openGraph: {
    type: "website",
    siteName: "OmniTools",
    locale: "id_ID",
    title: JUDUL,
    description: DESKRIPSI,
    ...(SITE_URL
      ? {
          url: "/",
          images: [
            {
              url: "/og-image.png",
              width: 1200,
              height: 630,
              alt: "OmniTools — generator QR Code, barcode, dan penghapus background foto",
            },
          ],
        }
      : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: JUDUL,
    description: DESKRIPSI,
    ...(SITE_URL ? { images: ["/og-image.png"] } : {}),
  },
};

export const viewport: Viewport = {
  // Zoom tidak dikunci: membatasi user-scalable menghalangi pembesaran teks.
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
  // Dikunci terang: tanpa ini, kontrol bawaan browser ikut menggelap kalau OS
  // memakai tema gelap, dan bentrok dengan halaman yang serba putih.
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${jakarta.variable} ${mono.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
