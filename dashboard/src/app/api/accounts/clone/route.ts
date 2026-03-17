import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const VENV_PYTHON = path.join(process.cwd(), "../venv/bin/python3");

export async function POST(req: Request) {
    try {
        const { sourceUsername, targetBotUsernames } = await req.json();

        if (!sourceUsername || !targetBotUsernames || targetBotUsernames.length === 0) {
            return NextResponse.json({ error: "Missing source username or target bots" }, { status: 400 });
        }

        // Validate inputs to prevent path traversal
        if (!/^[a-zA-Z0-9._]+$/.test(sourceUsername)) {
            return NextResponse.json({ error: "Invalid source username format" }, { status: 400 });
        }

        const scriptPath = path.join(process.cwd(), "..", "cloner.py");
        const targets = targetBotUsernames.join(",");

        console.log(`Command Center: Triggering Mirror of @${sourceUsername} to ${targetBotUsernames.length} bots`);

        // Use spawn with array args (safe against command injection) + venv python
        const child = spawn(VENV_PYTHON, [scriptPath, "--source", sourceUsername, "--targets", targets], {
            cwd: path.join(process.cwd(), ".."),
            detached: true,
            stdio: "ignore",
        });

        child.unref();

        return NextResponse.json({
            success: true,
            message: `Profile mirror task started for ${targetBotUsernames.length} bots from @${sourceUsername}. Check logs for details.`
        });
    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
