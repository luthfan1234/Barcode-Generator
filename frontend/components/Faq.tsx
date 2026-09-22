"use client";

import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { FAQ_ITEMS } from "@/lib/faq";
import { Reveal } from "./Reveal";

/**
 * Accordion FAQ.
 *
 * `height` adalah satu-satunya properti non-GPU yang dianimasikan di seluruh
 * halaman, karena accordion memang tidak punya padanan transform. Tingginya
 * diukur dari scrollHeight — `auto` tidak bisa di-interpolasi — lalu dilepas
 * kembali ke `auto` setelah transisi selesai supaya isinya tetap menyesuaikan
 * kalau teksnya membungkus ulang saat layar diubah.
 */
export function Faq() {
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function toggle(id: string) {
    const panel = panelRefs.current[id];
    const sebelumnya = terbuka;

    if (sebelumnya && sebelumnya !== id) {
      const lama = panelRefs.current[sebelumnya];
      if (lama) {
        lama.style.height = `${lama.scrollHeight}px`;
        void lama.offsetHeight;
        lama.style.height = "0px";
      }
    }

    if (sebelumnya === id) {
      if (panel) {
        // Dari `auto` ke nilai pasti dulu, baru ke 0 — tanpa nilai awal yang
        // konkret, transisinya tidak punya apa pun untuk di-interpolasi.
        panel.style.height = `${panel.scrollHeight}px`;
        void panel.offsetHeight;
        panel.style.height = "0px";
      }
      setTerbuka(null);
      return;
    }

    if (panel) panel.style.height = `${panel.scrollHeight}px`;
    setTerbuka(id);
  }

  return (
    <section className="section" id="faq">
      <div className="section__inner section__inner--narrow">
        <Reveal as="header" className="section__head">
          <p className="section__eyebrow">FAQ</p>
          <h2 className="section__title">Pertanyaan yang sering muncul</h2>
        </Reveal>

        <Reveal className="faq">
          {FAQ_ITEMS.map((item) => {
            const open = terbuka === item.id;
            return (
              <div className="faq__item" key={item.id}>
                <h3>
                  <button
                    type="button"
                    className="faq__trigger"
                    aria-expanded={open}
                    aria-controls={item.id}
                    onClick={() => toggle(item.id)}
                  >
                    <span>{item.question}</span>
                    <ChevronDown className="faq__chevron" width={17} height={17} aria-hidden="true" />
                  </button>
                </h3>
                <div
                  className="faq__panel"
                  id={item.id}
                  data-open={open ? "true" : undefined}
                  ref={(el) => { panelRefs.current[item.id] = el; }}
                  onTransitionEnd={(e) => {
                    if (e.propertyName !== "height") return;
                    const el = e.currentTarget;
                    if (el.dataset.open === "true") el.style.height = "auto";
                  }}
                >
                  <div className="faq__body">
                    {item.answer.map((paragraf, i) => (
                      <p key={i} dangerouslySetInnerHTML={{ __html: paragraf }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
