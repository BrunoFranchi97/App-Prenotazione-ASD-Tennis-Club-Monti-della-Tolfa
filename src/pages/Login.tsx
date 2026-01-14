"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';

const Login = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
      <Card className="w-full max-w-md shadow-lg rounded-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-green-800">ASD Tennis Club Monti della Tolfa</CardTitle>
          <CardDescription className="text-gray-600 mt-2">Accedi al tuo account per prenotare un campo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email o Numero Tessera</Label>
            <Input id="email" type="text" placeholder="Inserisci email o numero tessera" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="Inserisci password" />
          </div>
          <Button className="w-full bg-green-700 hover:bg-green-800 text-white">Accedi</Button>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 text-sm text-center">
          <Link to="/register" className="text-green-700 hover:underline">Non hai un account? Registrati</Link>
          <Link to="/forgot-password" className="text-gray-500 hover:underline">Password dimenticata?</Link>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Login;