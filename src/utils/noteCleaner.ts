/**
 * Cleans reservation notes by removing skill level and match request ID information
 * @param notes The original notes string
 * @returns Cleaned notes without skill level and match ID clutter
 */
export function cleanReservationNotes(notes?: string | null): string | undefined {
  if (!notes) return undefined;

  let cleaned = notes;
  
  // Remove skill level pattern (e.g., "Livello: intermedio", "Livello: avanzato", etc.)
  cleaned = cleaned.replace(/\s*Livello:\s*[a-zA-Zàèéìòù]+/gi, '');
  
  // Remove match request ID pattern (e.g., "Richiesta match ID: 12345" or "Richiesta match ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
  // Handle both simple IDs and UUIDs with hyphens
  cleaned = cleaned.replace(/\s*Richiesta\s+match\s+ID:\s*[\w-]+/gi, '');
  
  // Also remove any standalone UUID pattern that might remain
  cleaned = cleaned.replace(/\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '');
  
  // Remove any "ID:" patterns that might have been missed
  cleaned = cleaned.replace(/\s*ID:\s*\w+/gi, '');
  
  // Clean up the note about match type and skill level if they appear together
  cleaned = cleaned.replace(/\[MATCH\]\s*Partita\s*[^\.]*\.\s*Livello:/gi, '[MATCH] Partita');
  
  // Remove extra spaces and clean up punctuation
  cleaned = cleaned.replace(/\s+\./g, '.');
  cleaned = cleaned.replace(/\s+,/g, ',');
  cleaned = cleaned.replace(/\.\.+/g, '.');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.trim();
  
  // Remove trailing punctuation if it doesn't make sense
  cleaned = cleaned.replace(/[\.\,\;\:\s]+$/, '');
  
  // Remove "Partita " if it's at the beginning with no context
  cleaned = cleaned.replace(/^Partita\s+/i, '');
  
  return cleaned || undefined;
}