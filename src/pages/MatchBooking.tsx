// Aggiungi questa funzione helper nella parte iniziale del componente
const sendMatchConfirmationEmail = async (
  requesterEmail: string,
  requesterName: string,
  acceptorName: string,
  courtName: string,
  reservations: any[],
  matchDetails: { matchType: string; skillLevel: string; opponentName: string }
) => {
  try {
    await supabase.functions.invoke('send-booking-confirmation', {
      body: {
        userEmail: requesterEmail,
        userName: requesterName,
        courtName: courtName,
        reservations: reservations,
        matchDetails: {
          ...matchDetails,
          opponentName: acceptorName
        }
      },
    });
  } catch (e) {
    console.error("Error sending match confirmation email:", e);
  }
};

// Poi modifica la funzione handleFinalizeBooking per inviare l'email:
const handleFinalizeBooking = async () => {
  if (!matchRequest || !selectedCourtId || selectedSlots.length === 0) {
    showError("Devi selezionare un campo e almeno uno slot.");
    return;
  }

  if (totalSelectedHours > 3) {
    showError("Non puoi prenotare più di 3 ore consecutive.");
    return;
  }

  setSaving(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError("Utente non autenticato.");
      navigate('/login');
      return;
    }

    const courtIdNum = parseInt(selectedCourtId);
    const requestDate = parseISO(matchRequest.requested_date + 'T00:00:00');
    const sortedSlots = selectedSlots.sort();
    
    // Crea una nota per la prenotazione
    const note = `[MATCH] Partita ${matchRequest.match_type} con ${opponentName}. Livello: ${matchRequest.skill_level}. Richiesta match ID: ${matchRequest.id}`;
    
    const reservationsToInsert = sortedSlots.map(slotTime => {
      let slotStart = setMinutes(setHours(requestDate, parseInt(slotTime.split(':')[0])), parseInt(slotTime.split(':')[1]));
      slotStart = setSeconds(slotStart, 0);
      slotStart = setMilliseconds(slotStart, 0);
      const slotEnd = addHours(slotStart, 1);

      return {
        court_id: courtIdNum,
        user_id: user.id, // L'utente che accetta la richiesta
        starts_at: slotStart.toISOString(),
        ends_at: slotEnd.toISOString(),
        status: 'confirmed',
        booking_type: matchRequest.match_type === 'doppio' ? 'doppio' : 'singolare',
        notes: note,
        booked_for_first_name: opponentName?.split(' ')[0] || '',
        booked_for_last_name: opponentName?.split(' ').slice(1).join(' ') || '',
      };
    });

    // Verifica ultima volta la disponibilità
    for (const newRes of reservationsToInsert) {
      const newResStart = parseISO(newRes.starts_at);
      const newResEnd = parseISO(newRes.ends_at);

      const courtReservations = existingReservations.filter(r => r.court_id === courtIdNum);
      const overlap = courtReservations.some(res => {
        const resStart = parseISO(res.starts_at);
        const resEnd = parseISO(res.ends_at);
        return (isBefore(newResStart, resEnd) && isAfter(newResEnd, resStart)) || isEqual(newResStart, resStart);
      });

      if (overlap) {
        showError("Uno o più slot selezionati sono stati appena prenotati. Riprova.");
        setSaving(false);
        // Refresh disponibilità
        const startOfDay = format(requestDate, "yyyy-MM-dd'T'00:00:00.000'Z'");
        const endOfDay = format(requestDate, "yyyy-MM-dd'T'23:59:59.999'Z'");
        const { data, error } = await supabase
          .from('reservations')
          .select('*')
          .eq('court_id', courtIdNum)
          .gte('starts_at', startOfDay)
          .lte('ends_at', endOfDay);
        if (!error) setExistingReservations(data || []);
        return;
      }
    }

    // Inserisci le prenotazioni
    const { data: insertedReservations, error: insertError } = await supabase
      .from('reservations')
      .insert(reservationsToInsert)
      .select();

    if (insertError) throw insertError;

    // Aggiorna il match request come "matched"
    const { error: updateError } = await supabase
      .from('match_requests')
      .update({ 
        status: 'matched',
        matched_with_user_id: user.id,
        matched_reservation_id: insertedReservations[0]?.id
      })
      .eq('id', matchRequest.id);

    if (updateError) throw updateError;

    // Invia email di conferma al richiedente originale
    // Prima recuperiamo l'email del richiedente
    const { data: requesterData } = await supabase.auth.admin.getUserById(matchRequest.user_id);
    if (requesterData?.user?.email) {
      const requesterEmail = requesterData.user.email;
      const requesterName = profiles[matchRequest.user_id] || 'Socio';
      const court = courts.find(c => c.id === courtIdNum);
      
      await sendMatchConfirmationEmail(
        requesterEmail,
        requesterName,
        profiles[user.id] || 'Socio',
        court?.name || `Campo ${courtIdNum}`,
        insertedReservations,
        {
          matchType: matchRequest.match_type,
          skillLevel: matchRequest.skill_level,
          opponentName: opponentName
        }
      );
    }

    showSuccess("Prenotazione creata con successo! Ricorda di avvisare l'altro giocatore via WhatsApp.");
    navigate('/history');

  } catch (err: any) {
    showError("Errore durante la creazione della prenotazione: " + err.message);
  } finally {
    setSaving(false);
  }
};