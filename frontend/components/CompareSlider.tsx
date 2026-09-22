"use client";

import { ChevronsLeftRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pembanding sebelum/sesudah dengan pelacakan pointer 1:1.
 *
 * Kedua sisi dipotong saling melengkapi. Kalau hanya lapisan hasil yang
 * dipotong, area transparannya justru menampilkan foto asli yang ada persis
 * di bawahnya — seolah backgroundnya tidak terhapus sama sekali.
 */
export function CompareSlider({ before, after }: { before: string; after: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState(50);
  const [menggeser, setMenggeser] = useState(false);
  // Lebar disimpan di state, bukan dibaca dari ref saat render: pembacaan ref
  // saat render tidak memicu render ulang, jadi posisi handle akan salah
  // setelah jendela diubah ukurannya.
  const [lebar, setLebar] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLebar(el.clientWidth));
    ro.observe(el);
    setLebar(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const dariEvent = useCallback((clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);

  useEffect(() => { setPos(50); }, [after]);

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 10 : 2;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = pos - step;
    else if (e.key === "ArrowRight") next = pos + step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 100;
    if (next === null) return;
    e.preventDefault();
    setPos(Math.max(0, Math.min(100, next)));
  }

  return (
    <div
      className="compare"
      ref={wrapRef}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setMenggeser(true);
        dariEvent(e.clientX);
      }}
      onPointerMove={(e) => { if (menggeser) dariEvent(e.clientX); }}
      onPointerUp={(e) => {
        setMenggeser(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={() => setMenggeser(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="compare__img compare__before" src={before} alt="Foto asli"
           style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
      <span className="compare__tag compare__tag--before">Asli</span>

      <div className="compare__after" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="compare__img" src={after} alt="Hasil tanpa background" draggable={false} />
      </div>
      <span className="compare__tag compare__tag--after">Hasil</span>

      <button
        type="button"
        className="compare__handle"
        role="slider"
        aria-label="Geser untuk membandingkan sebelum dan sesudah"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        style={{ transform: `translateX(${lebar * (pos / 100)}px)` }}
        onKeyDown={onKeyDown}
      >
        <span className="compare__grip" aria-hidden="true">
          <ChevronsLeftRight width={16} height={16} />
        </span>
      </button>
    </div>
  );
}
