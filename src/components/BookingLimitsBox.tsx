"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertCircle, Info } from 'lucide-react';
import { BookingLimitsStatus } from '@/utils/bookingLimits';
import { cn } from '@/lib/utils';

interface BookingLimitsBoxProps {
  status: BookingLimitsStatus;
  isChecking?: boolean;
}

const BookingLimitsBox: React.FC<BookingLimitsBoxProps> = ({ status, isChecking }) => {
  const { weeklyCount, weeklyMax, dailyCount, dailyMax, durationMax } = status;
  
  const weeklyPercent = (weeklyCount / weeklyMax) * 100;
  const dailyPercent = (dailyCount / dailyMax) * 100;

  return (
    <Card className="shadow-sm border-primary/10 bg-primary/5">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-bold text-primary flex items-center">
          <ShieldCheck className="mr-2 h-4 w-4" /> I Tuoi Limiti
        </CardTitle>
        {isChecking && <span className="text-[10px] animate-pulse text-muted-foreground">Aggiornamento...</span>}
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-4">
        {/* Settimanali */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-gray-600">Prenotazioni attive (settimana)</span>
            <span className={cn(weeklyCount >= weeklyMax ? "text-destructive font-bold" : "text-primary")}>
              {weeklyCount}/{weeklyMax}
            </span>
          </div>
          <Progress value={weeklyPercent} className="h-1.5" />
        </div>

        {/* Giornalieri */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-gray-600">Prenotazioni oggi</span>
            <span className={cn(dailyCount >= dailyMax ? "text-destructive font-bold" : "text-primary")}>
              {dailyCount}/{dailyMax}
            </span>
          </div>
          <Progress value={dailyPercent} className="h-1.5" />
        </div>

        {/* Regole fisse */}
        <div className="pt-2 border-t border-primary/10 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Info className="h-3 w-3 text-club-orange" />
            <span>Durata max: 3h</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <AlertCircle className="h-3 w-3 text-club-orange" />
            <span>Rinnovabili: SI</span>
          </div>
        </div>

        {(!status.canBookMoreThisWeek || !status.canBookMoreToday) && (
          <div className="bg-white/80 p-2 rounded border border-destructive/20 text-[10px] text-destructive leading-tight flex gap-2 items-start">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>Hai raggiunto il limite di prenotazioni attive. Gioca i tuoi match programmati per sbloccare nuovi slot.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BookingLimitsBox;