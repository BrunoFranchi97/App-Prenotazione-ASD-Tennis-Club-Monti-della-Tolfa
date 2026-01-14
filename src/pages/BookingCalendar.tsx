"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from 'lucide-react';

const BookingCalendar = () => {
  const [date, setDate] = React.useState<Date | undefined>(new Date());
  const [selectedCourt, setSelectedCourt] = React.useState<string | undefined>(undefined);
  const [selectedTime, setSelectedTime] = React.useState<string | undefined>(undefined);

  const courts = [
    { id: 'cement1', name: 'Campo Cemento 1' },
    { id: 'cement2', name: 'Campo Cemento 2' },
    { id: 'syntheticGrass', name: 'Campo Erba Sintetica' },
    { id: 'syntheticClay', name: 'Campo Terra Sintetica' },
  ];

  const availableTimes = [
    '08:00 - 09:00', '09:00 - 10:00', '10:00 - 11:00', '11:00 - 12:00',
    '12:00 - 13:00', '13:00 - 14:00', '14:00 - 15:00', '15:00 - 16:00',
    '16:00 - 17:00', '17:00 - 18:00', '18:00 - 19:00', '19:00 - 20:00',
  ];

  const handleBooking = () => {
    if (date && selectedCourt && selectedTime) {
      // Logica di prenotazione qui (da integrare con il backend)
      console.log(`Prenotazione per il ${date.toLocaleDateString()} sul ${selectedCourt} alle ${selectedTime}`);
      // Mostra un toast di successo
    } else {
      // Mostra un toast di errore
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex items-center mb-8">
        <Link to="/dashboard" className="mr-4">
          <Button variant="outline" size="icon" className="text-green-700 border-green-700 hover:bg-green-50">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-green-800">Prenota un Campo</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-green-700">Seleziona Data</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              initialFocus
              className="rounded-md border shadow"
            />
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-green-700">Dettagli Prenotazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Campo</h3>
              <Select onValueChange={setSelectedCourt} value={selectedCourt}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleziona un campo" />
                </SelectTrigger>
                <SelectContent>
                  {courts.map((court) => (
                    <SelectItem key={court.id} value={court.id}>{court.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Orario</h3>
              <Select onValueChange={setSelectedTime} value={selectedTime}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleziona un orario" />
                </SelectTrigger>
                <SelectContent>
                  {availableTimes.map((time) => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleBooking}
              className="w-full bg-green-700 hover:bg-green-800 text-white"
              disabled={!date || !selectedCourt || !selectedTime}
            >
              Conferma Prenotazione
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BookingCalendar;