import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as net from "net";

function testProxyConnectivity(proxyUrl: string): Promise<{ ok: boolean; latency?: number; error?: string }> {
  return new Promise((resolve) => {
    try {
      // Parse proxy URL: http://user:pass@host:port
      const url = new URL(proxyUrl.startsWith("http") ? proxyUrl : `http://${proxyUrl}`);
      const host = url.hostname;
      const port = parseInt(url.port) || 80;

      const start = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.connect(port, host, () => {
        const latency = Date.now() - start;
        socket.destroy();
        resolve({ ok: true, latency });
      });

      socket.on("error", (err) => {
        socket.destroy();
        resolve({ ok: false, error: err.message });
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve({ ok: false, error: "Timeout (5s)" });
      });
    } catch (err: any) {
      resolve({ ok: false, error: err.message });
    }
  });
}

export async function POST() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  try {
    const { data: bots } = await sb
      .from("accounts")
      .select("id, username, proxy")
      .not("proxy", "is", null);

    const results = await Promise.all(
      (bots || []).map(async (bot: any) => {
        if (!bot.proxy) return { username: bot.username, ok: false, error: "No proxy" };
        const result = await testProxyConnectivity(bot.proxy);
        return { username: bot.username, proxy: bot.proxy, ...result };
      })
    );

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
