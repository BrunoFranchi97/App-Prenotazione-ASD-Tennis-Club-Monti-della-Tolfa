"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, FileText, Plus, AlertTriangle, Clock, Download, Upload, X, File, Calendar, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import UserNav from '@/components/UserNav';
import type { MedicalCertificate, CertificateType } from '@/types/supabase';

const MedicalCertificates = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<MedicalCertificate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [certificateType, setCertificateType] = useState<CertificateType>("agonistico");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchCertificates = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('medical_certificates').select('*').eq('user_id', user.id).order('expiry_date', { ascending: false });
        setCertificates(data || []);
      }
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCertificates(); }, []);

  const handleSave = async () => {
    if (!issueDate || !expiryDate) return showError("Compila le date di rilascio e scadenza.");
    if (isAfter(parseISO(issueDate), startOfDay(new Date()))) return showError("La data di rilascio non può essere nel futuro.");
    if (isAfter(parseISO(issueDate), parseISO(expiryDate))) return showError("La data di scadenza deve essere successiva a quella di rilascio.");
    if (!selectedFile) return showError("Devi caricare il file del certificato.");

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
      
      const { error: upErr } = await supabase.storage.from('medical-certificates').upload(fileName, selectedFile);
      if (upErr) throw upErr;

      const { error } = await supabase.from('medical_certificates').insert({
        user_id: user?.id,
        issue_date: issueDate,
        expiry_date: expiryDate,
        certificate_type: certificateType,
        notes: notes.trim().substring(0, 500),
        file_url: fileName
      });

      if (error) throw error;
      
      showSuccess("Certificato medico caricato con successo!");
      setDialogOpen(false);
      resetForm();
      fetchCertificates();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (certificate: MedicalCertificate) => {
    if (!certificate.file_url) {
      showError("File non trovato.");
      return;
    }

    setDownloadingId(certificate.id);
    try {
      const { data, error } = await supabase.storage
        .from('medical-certificates')
        .createSignedUrl(certificate.file_url, 60); // URL valido per 60 secondi

      if (error) throw error;

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      showError("Impossibile aprire il documento: " + err.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const resetForm = () => {
    setIssueDate("");
    setExpiryDate("");
    setCertificateType("agonistico");
    setNotes("");
    setSelectedFile(null);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-end mb-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <p className="text-sm font-bold text-club-orange uppercase tracking-[0.2em] mb-1">Documenti</p>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter flex items-center gap-3">
              Certificato Medico
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            className="h-11 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => { resetForm(); setDialogOpen(true); }}
          >
            <Plus className="mr-2 h-4 w-4" /> Aggiungi Nuovo
          </Button>
          <UserNav />
        </div>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {certificates.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-24 px-6 bg-white rounded-[2rem] shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <div className="w-20 h-20 rounded-3xl bg-primary/5 flex items-center justify-center mb-6">
              <ShieldCheck className="h-10 w-10 text-primary/30" />
            </div>
            <p className="text-lg font-bold text-gray-900">Nessun certificato</p>
            <p className="text-gray-400 font-medium mt-1 text-sm text-center">Carica il tuo certificato medico per poter giocare.</p>
          </div>
        ) : (
          certificates.map(c => {
            const isValid = isAfter(parseISO(c.expiry_date), startOfDay(new Date()));
            const isDownloading = downloadingId === c.id;

            return (
              <Card key={c.id} className={`border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden border-t-4 ${isValid ? 'border-t-primary' : 'border-t-destructive'}`}>
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <Badge className={`text-[10px] font-black uppercase border-none ${isValid ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                      {isValid ? "Valido" : "Scaduto"}
                    </Badge>
                    <Badge variant="outline" className="capitalize text-xs border-gray-100 text-gray-500 font-bold">
                      {c.certificate_type.replace('_', ' ')}
                    </Badge>
                  </div>
                  <CardTitle className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-club-orange flex-shrink-0" />
                    Scade il {format(parseISO(c.expiry_date), 'dd/MM/yyyy')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-4">
                  <div className="text-sm text-gray-500">
                    <p><span className="font-bold text-gray-700">Rilasciato il:</span> {format(parseISO(c.issue_date), 'dd/MM/yyyy')}</p>
                    {c.notes && <p className="mt-2 italic text-xs text-gray-400">"{c.notes}"</p>}
                  </div>
                  <div className="pt-3 border-t border-gray-50">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full rounded-xl text-primary hover:text-primary hover:bg-primary/5 font-bold"
                      onClick={() => handleDownload(c)}
                      disabled={isDownloading}
                    >
                      {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      {isDownloading ? "Apertura..." : "Vedi Documento"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-[2rem] border-none shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
          <DialogHeader>
            <DialogTitle className="text-gray-900 font-extrabold flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" /> Carica Certificato
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-sm">
              Inserisci i dati del tuo certificato e carica una scansione leggibile.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold ml-1 text-gray-700">Data Rilascio</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={e => setIssueDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold ml-1 text-gray-700">Data Scadenza</Label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Tipo Certificato</Label>
              <Select value={certificateType} onValueChange={v => setCertificateType(v as CertificateType)}>
                <SelectTrigger className="rounded-xl border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agonistico">Agonistico</SelectItem>
                  <SelectItem value="non_agonistico">Non Agonistico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">File Certificato (PDF o Immagine)</Label>
              <div
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${selectedFile ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/40'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <File className="h-8 w-8 text-primary mb-2" />
                    <span className="text-sm font-bold text-gray-800 truncate max-w-xs">{selectedFile.name}</span>
                    <Button variant="ghost" size="sm" className="mt-2 text-destructive text-xs" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}>Rimuovi</Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="h-8 w-8 text-gray-300 mb-2" />
                    <span className="text-sm text-gray-400 font-medium">Trascina o clicca per caricare</span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,image/*" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700 flex justify-between">
                Note <span className="text-gray-400 font-normal">{notes.length}/500</span>
              </Label>
              <Textarea
                maxLength={500}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Eventuali annotazioni del medico..."
                className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="rounded-xl text-gray-400 font-bold">Annulla</Button>
            <Button
              className="bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] text-white rounded-xl font-bold shadow-md shadow-primary/20"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Salvataggio..." : "Salva Certificato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MedicalCertificates;