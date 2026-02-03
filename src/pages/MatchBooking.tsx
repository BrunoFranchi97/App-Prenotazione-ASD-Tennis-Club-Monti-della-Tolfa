"use client";

import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Users, CheckCircle2, MapPin, Clock, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { it } from 'date-fns/locale';

const MatchBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { matchRequest, opponentName } = location.state || {};

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [courtName, setCourtName] = useState('');

  useEffect(() => {
    if (!matchRequest) {
      navigate('/find-match');
      return;
    }

    const verifyAvailability = async () => {
      setChecking(true);
      try {
        // Recupera nome del campo
        const { data: court } = await supabase.from('courts').select('name').eq('id', matchRequest.court_id).single();
        if (court) setCourtName(court.name);

        // Verifica sovrapposizione
        const start = setSeconds(setMilliseconds(setMinutes(setHours(parseISO(matchRequest.requested_date), parseInt(matchRequest.preferred_time_start.split(':')[0])), 0), 0), 0).toISOString();
        const end = setSeconds(setMilliseconds(setMinutes(setHours(parseISO(matchRequest.requested_date), parseInt(matchRequest.preferred_time_end.split(':')[0])), 0), 0), 0).toISOString();

        const { data: conflicts } = await supabase.from('reservations').select('id').eq('court_id', matchRequest.court_id).lt('starts_at', end).gt('ends_at', start);
        if (conflicts && conflicts.length > 0) {
          showError("Spiacente, il campo è stato prenotato nel frattempo.");
          navigate('/find-match');
        }
      } finally {
        setChecking(false);
      }
    };
    verifyAvailability();
  }, [matchRequest]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const startTime = matchRequest.preferred_time_start;
      const endTime = matchRequest.preferred_time_end;
      const startH = parseInt(startTime.split(':')[0]);
      const endH = parseInt(endTime.split(':')[0]);
      
      const reservations = [];
      for (let h = startH; h < endH; h++) {
        let s = setSeconds(setMilliseconds(setMinutes(setHours(parseISO(matchRequest.requested_date), h), 0), 0), 0);
        reservations.push({
          court_id: matchRequest.court_id,
          user_id: user?.id,
          starts_at: s.toISOString(),
          ends_at: addHours(s, 1).toISOString(),
          status: 'confirmed',
          booking_type: matchRequest.match_type,
          notes: `[MATCH] Sfida con ${opponentName}`,
          booked_for_first_name: opponentName.split(' ')[0],
          booked_for_last_name: opponentName.split(' ')[1] || ''
        });
      }

      const { error: insErr } = await supabase.from('reservations').insert(reservations);
      if (insErr) throw insErr;

      await supabase.from('match_requests').update({ status: 'matched', matched_with_user_id: user?.id }).eq('id', matchRequest.id);

      showSuccess("Partita confermata! Contatta il socio su WhatsApp.");
      navigate('/history');
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (checking) return <div className="p-8 text-center">Verifica disponibilità...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4">
      <header className="mb-8"><Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4"/> Indietro</Button></header>
      <Card className="max-w-xl mx-auto shadow-xl">
        <CardHeader className="text-center">
          <Users className="mx-auto h-12 w-12 text-primary mb-2" />
          <CardTitle>Conferma la Sfida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <div className="flex items-center gap-3"><Calendar className="text-club-orange h-5 w-5"/> <span className="font-medium">{format(parseISO(matchRequest.requested_date), 'dd MMMM yyyy', { locale: it })}</span></div>
            <div className="flex items-center gap-3"><Clock className="text-club-orange h-5 w-5"/> <span className="font-medium">{matchRequest.preferred_time_start} - {matchRequest.preferred_time_end}</span></div>
            <div className="flex items-center gap-3"><MapPin className="text-club-orange h-5 w-5"/> <span className="font-medium">{courtName}</span></div>
            <div className="pt-2 border-t">Sfidante: <strong>{opponentName}</strong></div>
          </div>
          <Alert><CheckCircle2 className="h-4 w-4"/><AlertTitle>Orario Bloccato</AlertTitle><AlertDescription>L'orario e il campo sono stati fissati dallo sfidante per garantire la correttezza della proposta.</AlertDescription></Alert>
          <Button onClick={handleConfirm} className="w-full h-12 text-lg" disabled={loading}>{loading ? "Conferma in corso..." : "Conferma e Prenota"}</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default MatchBooking;