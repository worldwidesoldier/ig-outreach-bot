import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function POST(req: Request) {
  const { action } = await req.json();

  if (!["start", "stop", "restart"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    execSync(`sudo systemctl ${action} ig-engine`, { timeout: 10000 });
    return NextResponse.json({ ok: true, action });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.stderr?.toString() || err.message },
      { status: 500 }
    );
  }
}
