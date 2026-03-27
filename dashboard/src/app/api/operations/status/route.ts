import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  try {
    // 1. Engine heartbeat + cycle info
    const { data: engineStatus } = await sb
      .from("system_status")
      .select("*")
      .eq("id", "engine")
      .single();

    // 2. All bots with their data
    const { data: bots } = await sb
      .from("accounts")
      .select("id, username, status, proxy, warmup_day")
      .order("username");

    // 3. DMs sent today per bot (from outreach_logs)
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: todayLogs } = await sb
      .from("outreach_logs")
      .select("account_id, sequence_step")
      .eq("status", "SUCCESS")
      .gte("created_at", todayStr);

    // Count per bot
    const dmCountMap: Record<string, number> = {};
    (todayLogs || []).forEach((log: any) => {
      dmCountMap[log.account_id] = (dmCountMap[log.account_id] || 0) + 1;
    });

    // 4. Merge bot data with DM counts
    const botsWithStats = (bots || []).map((bot: any) => ({
      ...bot,
      dms_today: dmCountMap[bot.id] || 0,
      proxy_configured: !!bot.proxy,
    }));

    // 5. Alerts: bots in bad state
    const alerts = botsWithStats.filter((b: any) =>
      ["CHALLENGE", "AT_RISK", "BANNED"].includes(b.status)
    );

    // 6. Reply rate
    const { data: leadStats } = await sb
      .from("leads")
      .select("status");
    const contacted = (leadStats || []).filter((l: any) =>
      ["SENT", "FOLLOWED_UP", "REPLIED"].includes(l.status)
    ).length;
    const replied = (leadStats || []).filter((l: any) => l.status === "REPLIED").length;
    const reply_rate = contacted > 0 ? Math.round((replied / contacted) * 100 * 10) / 10 : 0;

    return NextResponse.json({
      engine: engineStatus,
      bots: botsWithStats,
      alerts,
      total_bots: botsWithStats.length,
      healthy_count: botsWithStats.filter((b: any) => b.status === "HEALTHY").length,
      warming_count: botsWithStats.filter((b: any) => b.status === "WARMING_UP").length,
      at_risk_count: botsWithStats.filter((b: any) => b.status === "AT_RISK").length,
      challenge_count: botsWithStats.filter((b: any) => b.status === "CHALLENGE").length,
      total_dms_today: Object.values(dmCountMap).reduce((a: number, b: number) => a + b, 0),
      reply_rate,
      replied_count: replied,
      contacted_count: contacted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
