import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: Request) {
    try {
        const { rawText } = await req.json();
        if (!rawText) return NextResponse.json({ error: "No text provided" }, { status: 400 });

        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        const lines = rawText.split("\n").filter((l: string) => l.trim() !== "");
        const accounts = lines.map((line: string) => {
            const trimmed = line.trim();
            if (!trimmed) return null;

            // Extract proxy URL first (contains multiple ":" which would break a naive split)
            // Proxy always starts with http:// or https://
            const proxyMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
            const proxy: string | null = proxyMatch ? proxyMatch[1] : null;

            // Remove the proxy portion before splitting on ":"
            const withoutProxy = proxy
                ? trimmed.replace(proxy, "").replace(/::+/g, ":").replace(/:$/, "")
                : trimmed;

            const parts = withoutProxy.split(":").map((s: string) => s.trim()).filter(Boolean);
            if (parts.length < 2) return null;

            // Basic parsing: username:password
            const username = parts[0];
            const password = parts[1];

            let email: string | null = null;
            let email_password: string | null = null;
            let two_factor_seed: string | null = null;
            let backup_codes: string | null = null;

            // Smart detection for other parts
            parts.slice(2).forEach(part => {
                if (part.includes("@")) {
                    email = part;
                } else if (part.length >= 16 && /^[A-Z2-7]+=*$/.test(part)) {
                    // 2FA seed: base32 — uppercase letters and digits 2-7
                    two_factor_seed = part;
                } else if (part.includes(",") || (part.length < 10 && /^\d+$/.test(part))) {
                    backup_codes = part;
                } else if (email && !email_password) {
                    email_password = part;
                }
            });

            return {
                username,
                password,
                email,
                email_password,
                two_factor_seed,
                backup_codes: backup_codes ? [backup_codes] : null,
                proxy,
                status: "WARMING_UP",
                warmup_day: 0
            };
        }).filter(Boolean);

        if (accounts.length === 0) {
            return NextResponse.json({ error: "No valid accounts found. Ensure format is username:password[:extra...]" }, { status: 400 });
        }

        const { error } = await supabase.from("accounts").upsert(accounts, { onConflict: "username" });
        if (error) throw error;

        return NextResponse.json({ success: true, count: accounts.length });
    } catch (error: any) {
        console.error("Bulk Add Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
