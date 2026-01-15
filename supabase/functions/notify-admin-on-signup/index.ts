import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client with Service Role Key for admin access
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Get the new user data from the request body (sent by the database trigger)
    const payload = await req.json();
    const newProfile = payload.record;
    
    if (!newProfile || !newProfile.id) {
        console.error("[notify-admin-on-signup] Invalid payload received.");
        return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: corsHeaders });
    }

    const newUserName = newProfile.full_name || newProfile.id;
    console.log(`[notify-admin-on-signup] New user profile created: ${newUserName}`);

    // 2. Fetch all administrators' emails
    const { data: admins, error: adminError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .eq('is_admin', true);

    if (adminError) throw adminError;

    const adminEmails = ['admin@example.com']; // Placeholder for actual admin emails
    
    // In a real application, you would fetch admin emails from auth.users or a dedicated table
    // For this simulation, we will log the notification.

    console.log(`[notify-admin-on-signup] Notifying ${admins.length} administrators about new user: ${newUserName}`);
    
    // --- Email Sending Logic Placeholder ---
    // Here you would send an email to all adminEmails with a link to approve the user.
    // Example content:
    // Subject: Nuovo Socio da Approvare: ${newUserName}
    // Body: Il socio ${newUserName} si è appena registrato e attende l'approvazione. [Link al pannello Admin]

    return new Response(JSON.stringify({ message: 'Admin notification simulated successfully.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[notify-admin-on-signup] Error processing request:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});