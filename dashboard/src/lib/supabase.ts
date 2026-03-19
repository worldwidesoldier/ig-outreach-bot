import { createBrowserClient } from '@supabase/ssr';

// Auth-aware client — carries the logged-in user session automatically.
// All components importing from here will have RLS work correctly.
export const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
