import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nrnyfuqyeqcegnpoetrd.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybnlmdXF5ZXFjZWducG9ldHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzOTYzNDksImV4cCI6MjA4Mzk3MjM0OX0.uzA7TFROakNAPT8cwzmK59aR6UspK9Z_3aHmK-XWlMg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);