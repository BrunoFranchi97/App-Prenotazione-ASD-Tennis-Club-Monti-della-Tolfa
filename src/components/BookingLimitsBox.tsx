"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck, AlertCircle, Info } from 'lucide-react';
import { BookingLimitsStatus } from '@/utils/bookingLimits';
import { cn } from '@/lib/utils';

interface BookingLimitsBoxProps {
  status: BookingLimitsStatus;
  isChecking?: boolean;
}

const BookingLimitsBox: React.FC<BookingLimitsBoxProps> = ({ status, isChecking }) => {
  const { weeklyCount, weeklyMax } = status;
  
  const weeklyPercent = (weeklyCount / weeklyMax) * 100;

  return (
    <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] bg-primary/[0.03] rounded-[2rem] overflow-hidden">
      <CardHeader className="py-5 px-6 flex flex-row items-center justify-between space-y-0 bg-primary/[0.02]">
        <CardTitle className="text-sm font-extrabold text-primary flex items-center uppercase tracking-widest">
          <ShieldCheck className="mr-2 h-4 w-4" /> Policy Settimanale
        </CardTitle>
        {isChecking && <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>}
      </CardHeader>
      <CardContent className="py-6 px-6 space-y-6">
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <span className="text-xs font-bold text-gray-500 uppercase">Match Attivi</span>
            <span className={cn("text-lg font-black", weeklyCount >= weeklyMax ? "text-destructive" : "text-primary")}>
              {weeklyCount}<span className="text-gray-300 font-medium">/{weeklyMax}</span>
            </span>
          </div>
          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
             <div 
               className={cn("h-full transition-all duration-1000 ease-out rounded-full", weeklyCount >= weeklyMax ? "bg-destructive" : "bg-primary")}
               style={{ width: `${weeklyPercent}%` }}
             ></div>
          </div>
        </div>

        <div className="pt-5 border-t border-primary/5 grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
              <Info className="h-3 w-3 text-club-orange" /> Max Durata
            </div>
            <span className="text-sm font-bold text-gray-700">3 Ore</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
              <AlertCircle className="h-3 w-3 text-club-orange" /> Ciclo
            </div>
            <span className="text-sm font-bold text-gray-700">Lun - Dom</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BookingLimitsBox;