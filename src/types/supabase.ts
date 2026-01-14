export interface Court {
  id: number;
  name: string;
  surface: string;
  is_active: boolean;
}

export interface Reservation {
  id: string;
  court_id: number;
  user_id: string;
  starts_at: string; // ISO string
  ends_at: string;   // ISO string
  status: 'confirmed' | 'pending' | 'cancelled';
  notes?: string;
  created_at: string;
}