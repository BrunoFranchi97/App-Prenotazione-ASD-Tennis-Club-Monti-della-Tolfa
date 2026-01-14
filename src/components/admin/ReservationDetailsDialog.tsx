"use client";

import React from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, Clock, MapPin, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { Court, Reservation } from "@/types/supabase";

export default function ReservationDetailsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
  court: Court | undefined;
  bookedByName: string;
  onEdit: () => void;
}) {
  const { open, onOpenChange, reservation, court, bookedByName, onEdit } = props;

  if (!reservation) return null;

  const bookedFor =
    reservation.booked_for_first_name && reservation.booked_for_last_name
      ? `${reservation.booked_for_first_name} ${reservation.booked_for_last_name}`
      : "Se stesso";

  const statusLabel =
    reservation.status === "confirmed" ? "Confermata" : reservation.status === "pending" ? "In attesa" : "Annullata";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Dettagli prenotazione</DialogTitle>
          <DialogDescription>Riepilogo completo della prenotazione selezionata.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{statusLabel}</Badge>
            <span className="text-muted-foreground">ID: {reservation.id}</span>
          </div>

          <div className="grid gap-2 rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-club-orange" />
              <span className="font-medium">{court?.name || `Campo #${reservation.court_id}`}</span>
            </div>

            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-club-orange" />
              <span className="capitalize">
                {format(parseISO(reservation.starts_at), "EEEE dd MMMM yyyy", { locale: it })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-club-orange" />
              <span>
                {format(parseISO(reservation.starts_at), "HH:mm")} - {format(parseISO(reservation.ends_at), "HH:mm")}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-club-orange" />
              <span>
                Prenotato da: <span className="font-medium">{bookedByName}</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-club-orange" />
              <span>
                Prenotato per: <span className="font-medium">{bookedFor}</span>
              </span>
            </div>

            {reservation.notes ? (
              <div className="pt-2 text-muted-foreground">
                <span className="font-medium text-foreground">Note:</span> {reservation.notes}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          <Button onClick={onEdit}>Modifica</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}