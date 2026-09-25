"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { X, Search, ChevronDown, UserPlus, HelpCircle, Check } from 'lucide-react';
import { BookingType, BookingParticipantInput } from '@/types/supabase';
import { cn } from '@/lib/utils';

interface ParticipantPickerProps {
  bookingType: BookingType;
  bookerId: string;
  bookerName: string;
  // Secondo partecipante fisso, non rimovibile, diverso dal prenotante — usato in
  // MatchBooking.tsx per lo sfidante che ha pubblicato la richiesta su Cerca Partita.
  extraFixed?: { id: string; name: string; badge?: string };
  value: BookingParticipantInput[]; // include sempre il prenotante ({ user_id: bookerId })
  onChange: (value: BookingParticipantInput[]) => void;
}

const REQUIRED: Record<BookingType, { min: number; max: number }> = {
  singolare: { min: 2, max: 2 },
  doppio: { min: 4, max: 4 },
  lezione: { min: 1, max: 4 },
};

export const PLACEHOLDER_GUEST_NAME = 'Da definire';

const isMember = (p: BookingParticipantInput): p is { user_id: string } => 'user_id' in p;

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';

const ParticipantPicker: React.FC<ParticipantPickerProps> = ({ bookingType, bookerId, bookerName, extraFixed, value, onChange }) => {
  const { min, max } = REQUIRED[bookingType];
  const [allMembers, setAllMembers] = useState<{ id: string; full_name: string }[]>([]);
  const [namesById, setNamesById] = useState<Record<string, string>>(
    extraFixed ? { [bookerId]: bookerName, [extraFixed.id]: extraFixed.name } : { [bookerId]: bookerName }
  );
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestName, setGuestName] = useState('');

  const selectedMemberIds = useMemo(
    () => new Set(value.filter(isMember).map(p => p.user_id)),
    [value]
  );

  // Elenco soci caricato una sola volta: alimenta sia la ricerca testuale sia la lista
  // completa sfogliabile della combobox (§richiesta Bruno: guidare la selezione).
  useEffect(() => {
    supabase.from('member_names').select('id, full_name').order('full_name').then(({ data }) => {
      if (data) setAllMembers(data);
    });
  }, []);

  // Risolve i nomi dei soci già presenti in `value` ma non ancora in cache (es. hydration in modifica)
  useEffect(() => {
    const missing = value.filter(isMember).map(p => p.user_id).filter(id => !namesById[id]);
    if (missing.length === 0) return;
    supabase.from('member_names').select('id, full_name').in('id', missing).then(({ data }) => {
      if (!data) return;
      setNamesById(prev => {
        const next = { ...prev };
        data.forEach(m => { next[m.id] = m.full_name || 'Socio'; });
        return next;
      });
    });
  }, [value, namesById]);

  const availableMembers = useMemo(
    () => allMembers.filter(m => m.id !== bookerId && m.id !== extraFixed?.id && !selectedMemberIds.has(m.id)),
    [allMembers, bookerId, extraFixed, selectedMemberIds]
  );

  const atMax = value.length >= max;

  const addMember = (id: string, name: string) => {
    if (atMax) return;
    setNamesById(prev => ({ ...prev, [id]: name }));
    onChange([...value, { user_id: id }]);
    setComboboxOpen(false);
  };

  const addGuest = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || atMax) return;
    onChange([...value, { guest_name: trimmed }]);
    setGuestName('');
    setAddingGuest(false);
  };

  const addPlaceholder = () => {
    if (atMax) return;
    onChange([...value, { guest_name: PLACEHOLDER_GUEST_NAME }]);
  };

  const removeAt = (index: number) => {
    const p = value[index];
    if (isMember(p) && (p.user_id === bookerId || p.user_id === extraFixed?.id)) return; // partecipanti fissi: non si rimuovono
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Partecipanti</Label>
        <span className={cn(
          "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded",
          value.length >= min ? "text-primary bg-primary/5" : "text-club-orange bg-club-orange/10"
        )}>
          {value.length} {max === min ? `/ ${max}` : `(min ${min}, max ${max})`}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {value.map((p, i) => {
          const isBooker = isMember(p) && p.user_id === bookerId;
          if (isBooker) {
            return (
              <div key="booker" className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-primary/10 border-2 border-primary/20">
                <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-black">
                  {initials(bookerName)}
                </div>
                <span className="text-xs font-bold text-primary">{bookerName}</span>
                <span className="text-[8px] font-black uppercase tracking-tighter text-primary/60">Tu</span>
              </div>
            );
          }
          const isExtraFixed = extraFixed && isMember(p) && p.user_id === extraFixed.id;
          if (isExtraFixed) {
            return (
              <div key="extra-fixed" className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-club-orange/10 border-2 border-club-orange/20">
                <div className="w-6 h-6 rounded-full bg-club-orange text-white flex items-center justify-center text-[10px] font-black">
                  {initials(extraFixed!.name)}
                </div>
                <span className="text-xs font-bold text-club-orange">{extraFixed!.name}</span>
                <span className="text-[8px] font-black uppercase tracking-tighter text-club-orange/60">{extraFixed!.badge || 'Sfidante'}</span>
              </div>
            );
          }
          const isGuest = !isMember(p);
          const isPlaceholder = isGuest && p.guest_name === PLACEHOLDER_GUEST_NAME;
          const label = isMember(p) ? (namesById[p.user_id] || 'Socio') : p.guest_name;
          return (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border-2",
                isPlaceholder ? "border-dashed border-gray-300 bg-gray-50" : "border-gray-100 bg-white"
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black",
                isPlaceholder ? "bg-gray-200 text-gray-500" : "bg-club-orange/15 text-club-orange"
              )}>
                {isPlaceholder ? <HelpCircle className="h-3.5 w-3.5" /> : initials(label)}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-bold text-gray-700">{label}</span>
                {isGuest && !isPlaceholder && (
                  <span className="text-[8px] font-black uppercase tracking-tighter text-gray-400">Ospite</span>
                )}
              </div>
              <button type="button" onClick={() => removeAt(i)} className="text-gray-300 hover:text-destructive transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {!atMax && (
        <div className="space-y-2">
          <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-full h-11 px-4 rounded-xl border border-gray-100 bg-white flex items-center gap-2 text-sm text-gray-400 hover:border-primary/30 transition-colors"
              >
                <Search className="h-4 w-4 text-gray-300 shrink-0" />
                <span className="flex-1 text-left">Cerca o seleziona un socio...</span>
                <ChevronDown className="h-4 w-4 text-gray-300 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="p-0 rounded-xl border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.08)] w-[--radix-popover-trigger-width]"
            >
              <Command>
                <CommandInput placeholder="Cerca per nome..." className="h-11 text-sm" />
                <CommandList>
                  <CommandEmpty className="py-6 text-center text-xs font-bold uppercase tracking-widest text-gray-400">
                    Nessun socio trovato
                  </CommandEmpty>
                  <CommandGroup>
                    {availableMembers.map(m => (
                      <CommandItem
                        key={m.id}
                        value={m.full_name || 'Socio'}
                        onSelect={() => addMember(m.id, m.full_name || 'Socio')}
                        className="gap-2 rounded-lg px-3 py-2.5 cursor-pointer data-[selected=true]:bg-primary/5"
                      >
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black shrink-0">
                          {initials(m.full_name || 'Socio')}
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{m.full_name || 'Socio'}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="flex flex-wrap gap-2">
            {addingGuest ? (
              // Bottone con testo esplicito (feedback test direttivo: la sola spunta non
              // faceva capire che andava premuta per aggiungere l'ospite)
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  autoFocus
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addGuest(guestName); if (e.key === 'Escape') { setAddingGuest(false); setGuestName(''); } }}
                  placeholder="Nome ospite"
                  className="h-9 w-40 rounded-full border-gray-100 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-full px-4 text-xs font-bold bg-primary text-white"
                  disabled={!guestName.trim()}
                  onClick={() => addGuest(guestName)}
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> Aggiungi
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 rounded-full px-3 text-xs font-bold text-gray-400"
                  onClick={() => { setAddingGuest(false); setGuestName(''); }}
                >
                  Annulla
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingGuest(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border-2 border-dashed border-gray-200 text-gray-400 hover:border-club-orange/40 hover:text-club-orange transition-all"
              >
                <UserPlus className="h-3.5 w-3.5" /> Ospite
              </button>
            )}
            <button
              type="button"
              onClick={addPlaceholder}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border-2 border-dashed border-gray-200 text-gray-400 hover:border-primary/40 hover:text-primary transition-all"
            >
              <HelpCircle className="h-3.5 w-3.5" /> Da definire
            </button>
          </div>
          <p className="text-[10px] text-gray-400 font-medium leading-snug px-1">
            <span className="font-bold text-gray-500">Ospite</span> per chi non è socio del circolo ·{' '}
            <span className="font-bold text-gray-500">Da definire</span> se non sai ancora con chi giocherai
          </p>
        </div>
      )}
    </div>
  );
};

export default ParticipantPicker;
