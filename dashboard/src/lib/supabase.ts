import { createClient } from '@supabase/supabase-js';

// Standard anon client — SELECT and INSERT work without RLS restrictions.
// RLS is not user-scoped on this project (no user_id columns on tables).
export const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
