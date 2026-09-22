"use client";

import { useState } from "react";
import { BarcodeStudio } from "./BarcodeStudio";
import { Downloader } from "./Downloader";
import { QrStudio } from "./QrStudio";
import { RemoveBg } from "./RemoveBg";
import { Segmented, TOOLS, type ToolId } from "./Segmented";

export function Tools() {
  const [active, setActive] = useState<ToolId>("qr");
  // Panel mana yang boleh dianimasikan saat muncul. Dibiarkan null untuk
  // perpindahan lewat keyboard: aksi keyboard tidak dianimasikan.
  const [animate, setAnimate] = useState<ToolId | null>(null);

  function pindah(id: ToolId, byPointer: boolean) {
    setActive(id);
    setAnimate(byPointer ? id : null);
  }

  // Keempat panel tetap ter-mount dan hanya disembunyikan. Kalau di-unmount,
  // teks yang sudah diketik dan hasil yang sudah diproses akan hilang tiap
  // kali berpindah tab.
  const panel: Record<ToolId, React.ReactNode> = {
    qr: <QrStudio />,
    barcode: <BarcodeStudio />,
    downloader: <Downloader />,
    removebg: <RemoveBg />,
  };

  return (
    <section id="alat" className="tool-section" aria-label="Alat">
      <Segmented active={active} onChange={pindah} />
      <div className="workspace">
        {TOOLS.map(({ id }) => (
          <div key={id} hidden={active !== id} data-animate={animate === id ? "true" : undefined}>
            {panel[id]}
          </div>
        ))}
      </div>
    </section>
  );
}
