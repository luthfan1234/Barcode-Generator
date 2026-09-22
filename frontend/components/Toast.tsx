"use client";

import { CircleAlert, CircleCheckBig, Info } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Varian = "success" | "error" | "info";
type Pesan = { text: string; variant: Varian };

const ToastContext = createContext<(text: string, variant?: Varian) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [pesan, setPesan] = useState<Pesan | null>(null);
  const [terbuka, setTerbuka] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, variant: Varian = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setPesan({ text, variant });
    setTerbuka(true);
    // Error diberi waktu baca lebih lama daripada konfirmasi biasa.
    timer.current = setTimeout(() => setTerbuka(false), variant === "error" ? 4200 : 2600);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const Ikon = pesan?.variant === "error" ? CircleAlert : pesan?.variant === "info" ? Info : CircleCheckBig;

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Dibiarkan selalu ada di DOM supaya masuk dan keluarnya memakai
          transition yang bisa diinterupsi, bukan keyframes yang mengulang
          dari nol setiap kali dipicu beruntun. */}
      <div className="toast" role="status" aria-live="polite"
           data-open={terbuka ? "true" : "false"}
           data-variant={pesan?.variant ?? "success"}>
        <span className="toast__icon" aria-hidden="true">
          <Ikon width={16} height={16} />
        </span>
        <span>{pesan?.text ?? ""}</span>
      </div>
    </ToastContext.Provider>
  );
}
