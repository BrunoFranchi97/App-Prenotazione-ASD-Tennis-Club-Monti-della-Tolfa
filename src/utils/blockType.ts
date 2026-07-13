import { BlockType } from '@/types/supabase';

// Fonte unica di label + colore per i blocchi slot admin (Blocca Slot, Vista Settimanale)
export const BLOCK_TYPE_META: Record<BlockType, { label: string; bg: string }> = {
  lezione: { label: 'Lezione', bg: 'bg-club-orange' },
  manutenzione: { label: 'Manutenzione', bg: 'bg-gray-700' },
  torneo: { label: 'Torneo', bg: 'bg-purple-600' },
};

export const BLOCK_TYPE_OPTIONS: BlockType[] = ['lezione', 'manutenzione', 'torneo'];
