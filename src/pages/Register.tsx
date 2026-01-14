"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';

const Register = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
      <Card className="w-full max-w-md shadow-lg rounded-lg">
        <CardHeader className="text-center">
          <img src="/logo.png" alt="ASD Tennis Club Monti della Tolfa Logo" className="mx-auto h-20 w-20 mb-4" />
          <CardTitle className="text-3xl font-bold text-primary">Registrati</CardTitle>
          <CardDescription className="text-gray-600 mt-2">Crea il tuo account per iniziare a prenotare.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo</Label>
            <Input id="name" type="text" placeholder="Inserisci il tuo nome" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="Inserisci la tua email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="membershipNumber">Numero Tessera (opzionale)</Label>
            <Input id="membershipNumber" type="text" placeholder="Inserisci il numero tessera" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="Crea una password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Conferma Password</Label>
            <Input id="confirm-password" type="password" placeholder="Conferma la password" />
          </div>
          <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Registrati</Button>
        </CardContent>
        <CardFooter className="text-sm text-center">
          <Link to="/login" className="text-primary hover:underline">Hai già un account? Accedi</Link>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Register;