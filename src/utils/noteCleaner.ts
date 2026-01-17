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
  
  // Remove match request ID pattern (e.g., "Richiesta match ID: 12345")
  cleaned = cleaned.replace(/\s*Richiesta\s+match\s+ID:\s*\w+/gi, '');
  
  // Remove extra spaces and clean up punctuation
  cleaned = cleaned.replace(/\s+\./g, '.');
  cleaned = cleaned.replace(/\s+,/g, ',');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.trim();
  
  // Remove trailing punctuation if it doesn't make sense
  cleaned = cleaned.replace(/[\.\,\;\:]+$/, '');
  
  return cleaned || undefined;
}