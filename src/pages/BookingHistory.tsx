// Nel rendering della card delle prenotazioni, aggiungi:
  {reservation.notes?.includes('[MATCH]') && (
    <Badge variant="secondary" className="ml-2 bg-purple-100 text-purple-800">
      <Users className="mr-1 h-3 w-3" /> Match
    </Badge>
  )}