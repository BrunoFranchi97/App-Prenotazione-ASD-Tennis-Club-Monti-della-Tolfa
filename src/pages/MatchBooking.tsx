"use client";

import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Users, CheckCircle2, MapPin, Clock, Calendar, ChevronRight, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { it } from 'date-fns/locale';
import UserNav from '@/components/UserNav';
import { cn } from '@/lib/utils';

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
        const { data: court } = await supabase.from('courts').select('name').eq('id', matchRequest.court_id).single();
        if (court) setCourtName(court.name);

        const baseDate = parseISO(matchRequest.requested_date);
        const startH = parseInt(matchRequest.preferred_time_start.split(':')[0]);
        const endH = parseInt(matchRequest.preferred_time_end.split(':')[0]);

        const start = setSeconds(setMilliseconds(setMinutes(setHours(baseDate, startH), 0), 0), 0).toISOString();
        const end = setSeconds(setMilliseconds(setMinutes(setHours(baseDate, endH), 0), 0), 0).toISOString();

        const { data: conflicts } = await supabase
          .from('reservations')
          .select('id')
          .eq('court_id', matchRequest.court_id)
          .lt('starts_at', end)
          .gt('ends_at', start)
          .neq('status', 'cancelled');

        if (conflicts && conflicts.length > 0) {
          showError("Spiacente, il campo è stato prenotato nel frattempo.");
          navigate('/find-match');
        }
      } catch (err) {
        console.error("Error verifying availability:", err);
      } finally {
        setChecking(false);
      }
    };
    verifyAvailability();
  }, [matchRequest, navigate]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const baseDate = parseISO(matchRequest.requested_date);
      const startH = parseInt(matchRequest.preferred_time_start.split(':')[0]);
      const endH = parseInt(matchRequest.preferred_time_end.split(':')[0]);
      
      const reservations = [];
      for (let h = startH; h < endH; h++) {
        let s = setSeconds(setMilliseconds(setMinutes(setHours(baseDate, h), 0), 0), 0);
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

      showSuccess("Partita confermata! Sfidante notificato.");
      navigate('/history');
    } catch (err: any) { showError(err.message); }
    finally { setLoading(false); }
  };

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]"><div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-center mb-10 max-w-4xl mx-auto">
        <div className="flex items-center gap-6">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">Conferma Sfida</h1>
        </div>
        <UserNav />
      </header>

      <Card className="max-w-xl mx-auto border-none shadow-[0_20px_40px_rgba(0,0,0,0.04)] rounded-[2.5rem] bg-white overflow-hidden">
        <div className="bg-primary p-10 text-center relative overflow-hidden">
           <Zap className="absolute -top-10 -right-10 h-40 w-40 text-white/10 rotate-12" />
           <div className="bg-white/20 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md">
              <Users className="text-white h-10 w-10" />
           </div>
           <CardTitle className="text-white text-3xl font-black tracking-tight">Accetta il Match</CardTitle>
           <p className="text-white/70 font-medium mt-2">Stai per sfidare {opponentName}</p>
        </div>
        
        <CardContent className="p-10 space-y-8">
          <div className="bg-gray-50/80 rounded-[2rem] p-8 space-y-6 border border-gray-100">
            <div className="flex items-center gap-5">
              <div className="bg-white p-3 rounded-2xl shadow-sm"><Calendar className="text-club-orange h-6 w-6"/></div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data della partita</p>
                <p className="text-lg font-bold text-gray-900 capitalize">{format(parseISO(matchRequest.requested_date), 'EEEE d MMMM yyyy', { locale: it })}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-5">
              <div className="bg-white p-3 rounded-2xl shadow-sm"><Clock className="text-club-orange h-6 w-6"/></div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Orario bloccato</p>
                <p className="text-lg font-bold text-gray-900">{matchRequest.preferred_time_start} - {matchRequest.preferred_time_end}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-5">
              <div className="bg-white p-3 rounded-2xl shadow-sm"><MapPin className="text-club-orange h-6 w-6"/></div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Campo designato</p>
                <p className="text-lg font-bold text-gray-900">{courtName}</p>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 flex gap-4">
            <CheckCircle2 className="text-primary h-6 w-6 shrink-0" />
            <p className="text-sm text-primary/80 font-medium leading-relaxed">Confermando, il campo verrà prenotato a tuo nome e la sfida risulterà chiusa. Potrai contattare {opponentName} via WhatsApp.</p>
          </div>

          <Button 
            onClick={handleConfirm} 
            className="w-full h-16 rounded-[1.5rem] bg-gradient-to-br from-primary to-[#23532f] text-xl font-black shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-3" 
            disabled={loading}
          >
            {loading ? <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin"></div> : <>Accetta e Prenota <ChevronRight size={24} /></>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default MatchBooking;