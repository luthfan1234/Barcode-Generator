import { Faq } from "@/components/Faq";
import { Cta, Features, Footer, Header, Hero, Steps } from "@/components/Sections";
import { Tools } from "@/components/Tools";
import { FAQ_ITEMS, faqPlainText } from "@/lib/faq";
import { SITE_URL } from "@/lib/site";

/**
 * Structured data dibentuk dari daftar FAQ yang sama dengan yang dirender di
 * halaman, jadi isinya dijamin tidak pernah berbeda. Google menganggap
 * structured data yang tidak cocok dengan konten terlihat sebagai pelanggaran.
 */
function structuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "OmniTools",
        description:
          "Buat QR Code dan barcode online gratis, hapus background foto jadi PNG transparan, " +
          "dan simpan video sosial media. Langsung jadi di browser.",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any",
        inLanguage: "id-ID",
        offers: { "@type": "Offer", price: "0", priceCurrency: "IDR" },
        featureList: [
          "Generator QR Code dengan pilihan warna dan koreksi error",
          "Generator barcode Code 128, EAN-13, EAN-8, UPC-A, Code 39, ISBN-13, ITF",
          "Hapus background foto menjadi PNG transparan",
          "Simpan video dan audio dari sosial media",
        ],
        ...(SITE_URL ? { url: `${SITE_URL}/` } : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: faqPlainText(item) },
        })),
      },
    ],
  };
}

export default function Page() {
  return (
    <>
      <a className="skip-link" href="#alat">Lompat ke alat</a>
      <Header />

      <main id="top">
        <Hero />
        <Tools />
        <Features />
        <Steps />
        <Faq />
        <Cta />
      </main>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />
    </>
  );
}
