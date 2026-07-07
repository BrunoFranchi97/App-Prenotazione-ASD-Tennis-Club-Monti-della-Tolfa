"use client";

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// Attivo SOLO nell'app installata su iOS: lì non esiste né il tasto ricarica
// né il pull-to-refresh nativo. Nel browser e su Android standalone il
// pull-to-refresh nativo c'è già, quindi il componente resta inerte.
const isIosStandalone = (): boolean => {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return standalone && isIos;
};

const PULL_RESISTANCE = 0.5; // il dito percorre ~il doppio dell'indicatore
const TRIGGER_AT = 70;       // px (già smorzati) oltre i quali si ricarica
const MAX_PULL = 110;

const PullToRefresh = () => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const pullRef = useRef(0);
  const startY = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);
  const directionDecided = useRef(false);

  useEffect(() => {
    if (!isIosStandalone()) return;

    const updatePull = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    // Il gesto parte solo se la pagina è in cima e il tocco non è dentro
    // un contenitore già scrollato o un dialog aperto
    const hasScrolledAncestor = (target: EventTarget | null): boolean => {
      let el = target instanceof HTMLElement ? target : null;
      while (el && el !== document.body) {
        if (el.scrollTop > 0) return true;
        el = el.parentElement;
      }
      return false;
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const atTop = (document.scrollingElement?.scrollTop ?? 0) <= 0;
      if (!atTop || hasScrolledAncestor(e.target) || target?.closest('[role="dialog"]')) {
        tracking.current = false;
        return;
      }
      tracking.current = true;
      directionDecided.current = false;
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current) return;
      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;

      if (!directionDecided.current) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        // Gesto prevalentemente orizzontale (es. griglia settimanale): ignora
        if (Math.abs(dx) > Math.abs(dy)) {
          tracking.current = false;
          return;
        }
        directionDecided.current = true;
      }

      updatePull(dy > 0 ? Math.min(dy * PULL_RESISTANCE, MAX_PULL) : 0);
    };

    const onTouchEnd = () => {
      if (!tracking.current) return;
      tracking.current = false;
      if (pullRef.current >= TRIGGER_AT) {
        setRefreshing(true);
        // Lascia un attimo lo spinner visibile, poi ricarica tutto da rete
        setTimeout(() => window.location.reload(), 400);
      } else {
        updatePull(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  if (pull <= 0 && !refreshing) return null;

  const ready = refreshing || pull >= TRIGGER_AT;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-[100] flex justify-center transition-none"
      style={{ top: `calc(env(safe-area-inset-top) + ${Math.round(pull) - 56}px)` }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white border border-gray-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-none"
        style={{ opacity: Math.min(pull / TRIGGER_AT, 1) }}
      >
        <RefreshCw
          size={20}
          className={cn(
            'transition-none',
            ready ? 'text-primary' : 'text-gray-300',
            refreshing && 'animate-spin',
          )}
          style={refreshing ? undefined : { transform: `rotate(${pull * 2.5}deg)` }}
        />
      </div>
    </div>
  );
};

export default PullToRefresh;
