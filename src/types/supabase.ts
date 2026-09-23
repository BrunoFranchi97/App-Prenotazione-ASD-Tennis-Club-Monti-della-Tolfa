export interface Court {
  id: number;
  name: string;
  surface: string;
  is_active: boolean;
}

export type BookingType = 'singolare' | 'doppio' | 'lezione';
export type ProfileStatus = 'pending' | 'approved' | 'rejected';
export type BlockType = 'lezione' | 'manutenzione' | 'torneo';

export interface Reservation {
  id: string;
  court_id: number;
  user_id: string;
  starts_at: string; // ISO string
  ends_at: string; // ISO string
  status: 'confirmed' | 'pending' | 'cancelled';
  booking_type: BookingType;
  block_type?: BlockType | null;
  notes?: string | null;
  created_at: string;
  booked_for_first_name?: string | null;
  booked_for_last_name?: string | null;
  booked_for_user_id?: string | null;
  updated_at?: string;
  is_paid?: boolean | null;
  booking_id?: string | null;
  lights?: boolean | null;
  unit_price_cents?: number | null;
  rate_id?: string | null;
}

export type SkillLevel = 'principiante' | 'intermedio' | 'avanzato' | 'agonista';
export type MatchType = 'singolare' | 'doppio';
export type MatchRequestStatus = 'open' | 'matched' | 'cancelled' | 'expired';

export interface MatchRequest {
  id: string;
  user_id: string;
  requested_date: string; // YYYY-MM-DD
  preferred_time_start: string; // HH:MM:SS
  preferred_time_end: string; // HH:MM:SS
  skill_level: SkillLevel;
  match_type: MatchType;
  notes?: string | null;
  status: MatchRequestStatus;
  matched_with_user_id?: string | null;
  matched_reservation_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type MemberType = 'socio_effettivo' | 'frequentatore_occasionale';

export type CertificateType = 'agonistico' | 'non_agonistico';

export interface MedicalCertificate {
  id: string;
  user_id: string;
  issue_date: string; // YYYY-MM-DD
  expiry_date: string; // YYYY-MM-DD
  certificate_type: CertificateType;
  file_url?: string | null;
  notes?: string | null;
  is_valid: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  is_admin: boolean;
  approved: boolean; // Mantenuto per compatibilità legacy
  status: ProfileStatus;
  approved_at?: string | null;
  skill_level: SkillLevel;
  member_type: MemberType;
  created_at: string;
  terms_accepted?: boolean;
  personal_data_accepted?: boolean;
  health_data_accepted?: boolean;
  consent_date?: string;
}

export type TournamentOverrideMode = 'auto' | 'on' | 'off';

export interface Tournament {
  id: string;
  name: string;
  description?: string | null;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  poster_url?: string | null;
  override_mode: TournamentOverrideMode;
  created_at: string;
  updated_at: string;
}

export interface ReservationGroup {
  id: string;
  courtId: number;
  courtName: string;
  date: Date;
  reservations: Reservation[];
  startTime: string;
  endTime: string;
  totalHours: number;
  status: string;
  bookedForName: string;
  notes?: string;
  bookingType?: BookingType;
}
// --- Portafoglio (wallet) e pagamenti — vedi docs/piano-wallet-pagamenti.md ---

export type PaymentMode = 'wallet' | 'free' | 'legacy' | 'admin';
export type WalletLedgerKind =
  | 'topup_card'
  | 'topup_cash'
  | 'booking_charge'
  | 'booking_cover'
  | 'booking_refund'
  | 'admin_correction'
  | 'chargeback';
export type WalletTopupStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'chargeback';

export interface Wallet {
  user_id: string;
  balance_cents: number;
  updated_at: string;
}

export interface WalletLedgerEntry {
  id: number;
  user_id: string;
  amount_cents: number; // + accredito, - addebito
  balance_after_cents: number;
  kind: WalletLedgerKind;
  booking_id?: string | null;
  topup_id?: string | null;
  covers_user_id?: string | null; // quota di un altro socio coperta dal prenotante
  created_by?: string | null;
  note?: string | null;
  created_at: string;
}

export interface WalletTopup {
  id: string;
  user_id: string;
  amount_cents: number;
  provider: string;
  provider_ref?: string | null;
  checkout_url?: string | null;
  status: WalletTopupStatus;
  unrecovered_cents: number;
  created_at: string;
  paid_at?: string | null;
  updated_at: string;
}

export interface CourtRate {
  id: string;
  valid_from: string;
  rate_day_cents: number;
  rate_lights_cents: number;
  note?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface LightsOverride {
  day: string;
  force_lights: boolean;
  reason?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface Booking {
  id: string;
  booker_id: string;
  court_id: number;
  booking_type: BookingType;
  coach_name?: string | null;
  coach_fee_cents?: number | null;
  booker_pays_all: boolean;
  payment_mode: PaymentMode;
  status: 'active' | 'cancelled';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface BookingParticipant {
  id: string;
  booking_id: string;
  user_id?: string | null; // null = ospite
  guest_name?: string | null;
  created_at: string;
}

// Partecipante passato alle RPC create_booking / update_booking / quote_booking
export type BookingParticipantInput = { user_id: string } | { guest_name: string };

// Dettaglio strutturato di un errore SALDO_INSUFFICIENTE (vedi wallet_settle_booking),
// così la UI può mostrarlo a righe invece che come frase unica.
export interface WalletShortfallDetail {
  user_id: string;
  full_name: string;
  needed_cents: number;
  available_cents: number;
  lines: { label: string; amount_cents: number }[];
}

// Risposta di create_booking / update_booking / cancel_booking / quote_booking
export interface BookingSummary {
  ok?: boolean; // solo quote_booking
  error?: string; // solo quote_booking, se l'operazione non sarebbe possibile
  code?: string; // solo quote_booking: codice errore (es. SALDO_INSUFFICIENTE, SLOT_OCCUPATO)
  detail?: WalletShortfallDetail; // solo quote_booking, presente solo per SALDO_INSUFFICIENTE
  booking_id: string;
  version: number;
  status: 'active' | 'cancelled';
  payment_mode: PaymentMode;
  quota_cents: number; // costo per partecipante
  hours: {
    reservation_id: string;
    starts_at: string;
    ends_at: string;
    lights: boolean | null;
    unit_price_cents: number | null;
  }[];
  movements: {
    user_id: string;
    full_name: string | null;
    amount_cents: number;
    kind: WalletLedgerKind;
    covers_user_id: string | null;
    covers_full_name: string | null;
  }[];
  booker_balance_cents: number | null;
}
