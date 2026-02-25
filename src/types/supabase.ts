export interface Court {
  id: number;
  name: string;
  surface: string;
  is_active: boolean;
}

export type BookingType = 'singolare' | 'doppio' | 'lezione';
export type ProfileStatus = 'pending' | 'approved' | 'rejected';

export interface Reservation {
  id: string;
  court_id: number;
  user_id: string;
  starts_at: string; // ISO string
  ends_at: string; // ISO string
  status: 'confirmed' | 'pending' | 'cancelled';
  booking_type: BookingType;
  notes?: string | null;
  created_at: string;
  booked_for_first_name?: string | null;
  booked_for_last_name?: string | null;
  updated_at?: string; 
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
  created_at: string;
  terms_accepted?: boolean;
  personal_data_accepted?: boolean;
  health_data_accepted?: boolean;
  consent_date?: string;
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