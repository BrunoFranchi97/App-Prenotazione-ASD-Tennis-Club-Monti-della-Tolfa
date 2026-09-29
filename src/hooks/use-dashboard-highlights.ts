import { useEffect, useState } from 'react';
import { differenceInCalendarDays, isAfter, parseISO, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { DashboardCertificateHighlight, DashboardNextBooking } from '@/types/supabase';

/** Giorni di preavviso prima che il certificato diventi "in scadenza" (ambra in dashboard) */
export const CERTIFICATE_WARNING_DAYS = 30;

// Dati vivi mostrati nei riquadri della dashboard: prossima partita e stato del certificato.
// Stessi criteri delle pagine di destinazione (BookingHistory, MedicalCertificates), così la
// dashboard non dice mai qualcosa di diverso da quello che il socio trova aprendo la pagina.
export function useDashboardHighlights(userId: string | null, fullName: string | null) {
  const [nextBooking, setNextBooking] = useState<DashboardNextBooking | null>(null);
  const [certificate, setCertificate] = useState<DashboardCertificateHighlight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let isMounted = true;

    const fetchNextBooking = async () => {
      // Stesso filtro di "I miei Campi": fatte da me, per me, o legacy col mio nome
      const parts = (fullName ?? '').trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ');
      const filter = firstName && lastName
        ? `user_id.eq.${userId},booked_for_user_id.eq.${userId},and(booked_for_first_name.ilike.${firstName},booked_for_last_name.ilike.${lastName},booked_for_user_id.is.null)`
        : `user_id.eq.${userId},booked_for_user_id.eq.${userId}`;

      const { data } = await supabase
        .from('reservations')
        .select('starts_at, court_id')
        .or(filter)
        .neq('status', 'cancelled')
        .gt('ends_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(1);
      return (data?.[0] as DashboardNextBooking | undefined) ?? null;
    };

    const fetchCertificate = async (): Promise<DashboardCertificateHighlight> => {
      const { data } = await supabase
        .from('medical_certificates')
        .select('expiry_date')
        .eq('user_id', userId)
        .order('expiry_date', { ascending: false })
        .limit(1);
      const expiry = data?.[0]?.expiry_date as string | undefined;
      if (!expiry) return { status: 'missing', expiry_date: null, days_left: null };

      const today = startOfDay(new Date());
      const expiryDate = parseISO(expiry);
      const daysLeft = differenceInCalendarDays(expiryDate, today);
      // Stessa regola di MedicalCertificates.tsx: valido solo se scade dopo oggi
      if (!isAfter(expiryDate, today)) return { status: 'expired', expiry_date: expiry, days_left: daysLeft };
      if (daysLeft <= CERTIFICATE_WARNING_DAYS) return { status: 'expiring', expiry_date: expiry, days_left: daysLeft };
      return { status: 'valid', expiry_date: expiry, days_left: daysLeft };
    };

    setLoading(true);
    Promise.all([fetchNextBooking(), fetchCertificate()])
      .then(([booking, cert]) => {
        if (!isMounted) return;
        setNextBooking(booking);
        setCertificate(cert);
      })
      .finally(() => { if (isMounted) setLoading(false); });

    return () => { isMounted = false; };
  }, [userId, fullName]);

  return { nextBooking, certificate, loading };
}
