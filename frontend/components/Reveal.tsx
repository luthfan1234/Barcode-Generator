"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Scroll reveal untuk section marketing.
 *
 * Gate: frekuensi "jarang / kunjungan pertama", tujuannya mencegah section
 * muncul mendadak saat masuk viewport. Hanya transform dan opacity, memakai
 * transition (bukan keyframes) supaya bisa diinterupsi, dan dijalankan sekali
 * per elemen — mengulang animasi tiap kali di-scroll lewat berarti antarmuka
 * melawan pembacanya.
 *
 * Keadaan awal tersembunyi hanya dipasang setelah observer dipastikan ada dan
 * user tidak meminta pengurangan gerak, jadi konten tidak akan pernah hilang
 * permanen kalau JavaScript gagal.
 */
export function Reveal({
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement | null>(null);
  const [siap, setSiap] = useState(false);
  const [terlihat, setTerlihat] = useState(false);

  useEffect(() => {
    const bisa =
      typeof IntersectionObserver !== "undefined" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!bisa) {
      setTerlihat(true);
      return;
    }

    setSiap(true);
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          setTerlihat(true);
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -72px 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`.trim()}
      data-armed={siap ? "true" : undefined}
      data-visible={terlihat ? "true" : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
