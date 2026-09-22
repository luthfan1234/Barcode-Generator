"use client";

import { Barcode, Download, ImageMinus, QrCode } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

export type ToolId = "qr" | "barcode" | "downloader" | "removebg";

export const TOOLS: { id: ToolId; label: string; Icon: typeof QrCode }[] = [
  { id: "qr", label: "QR Code", Icon: QrCode },
  { id: "barcode", label: "Barcode", Icon: Barcode },
  { id: "downloader", label: "Downloader", Icon: Download },
  { id: "removebg", label: "Remove BG", Icon: ImageMinus },
];

/**
 * Segmented control dengan indikator clip-path.
 *
 * Resep "tab indicator with a color transition": lapisan aktif diduplikasi
 * lalu dipotong, sehingga background dan warna teks berpindah presisi
 * bersamaan alih-alih dua warna yang di-interpolasi terpisah.
 */
export function Segmented({
  active,
  onChange,
}: {
  active: ToolId;
  onChange: (id: ToolId, byPointer: boolean) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const moveIndicator = useCallback(() => {
    const track = trackRef.current;
    const layer = layerRef.current;
    const btn = btnRefs.current[active];
    if (!track || !layer || !btn) return;

    // offsetLeft, bukan getBoundingClientRect: track bisa di-scroll horizontal
    // di layar sempit, dan offsetLeft tidak ikut bergeser saat di-scroll.
    const left = btn.offsetLeft - 4; // 4px = padding track
    layer.style.setProperty("--clip-left", `${left}px`);
    layer.style.setProperty("--clip-right", `${left + btn.offsetWidth}px`);
    track.dataset.ready = "true";

    // Pastikan tab terpilih tidak tersembunyi di balik tepi track.
    const pad = 8;
    const kiri = btn.offsetLeft - pad;
    const kanan = btn.offsetLeft + btn.offsetWidth + pad;
    if (kiri < track.scrollLeft) track.scrollLeft = kiri;
    else if (kanan > track.scrollLeft + track.clientWidth) {
      track.scrollLeft = kanan - track.clientWidth;
    }
  }, [active]);

  useEffect(() => {
    moveIndicator();
    const ro = new ResizeObserver(moveIndicator);
    if (trackRef.current) ro.observe(trackRef.current);
    window.addEventListener("resize", moveIndicator);
    document.fonts?.ready.then(moveIndicator).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", moveIndicator);
    };
  }, [moveIndicator]);

  function onKeyDown(e: React.KeyboardEvent) {
    const i = TOOLS.findIndex((t) => t.id === active);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % TOOLS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TOOLS.length) % TOOLS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TOOLS.length - 1;
    if (next === null) return;
    e.preventDefault();
    btnRefs.current[TOOLS[next].id]?.focus();
    // Dipicu keyboard: panel tidak dianimasikan (aturan frekuensi).
    onChange(TOOLS[next].id, false);
  }

  return (
    <nav className="tabs" aria-label="Pilih alat">
      <div className="segmented" ref={trackRef} onKeyDown={onKeyDown}>
        <div className="segmented__row" role="tablist" aria-label="Daftar alat">
          {TOOLS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="segmented__item"
              role="tab"
              id={`tab-${id}`}
              aria-controls={`panel-${id}`}
              aria-selected={active === id}
              tabIndex={active === id ? 0 : -1}
              data-tab={id}
              ref={(el) => { btnRefs.current[id] = el; }}
              onClick={() => onChange(id, true)}
            >
              <Icon width={16} height={16} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        {/* Salinan visual untuk state aktif, dipotong ke posisi tab terpilih. */}
        <div className="segmented__layer" aria-hidden="true" ref={layerRef}>
          <div className="segmented__row">
            {TOOLS.map(({ id, label, Icon }) => (
              <span key={id} className="segmented__item">
                <Icon width={16} height={16} /> {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
