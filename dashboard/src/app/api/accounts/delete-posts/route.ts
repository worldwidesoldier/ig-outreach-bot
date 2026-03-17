import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const VENV_PYTHON = path.join(process.cwd(), "../venv/bin/python3");

export async function POST(req: Request) {
    try {
        const { usernames } = await req.json();

        if (!usernames || usernames.length === 0) {
            return NextResponse.json({ error: "No usernames provided" }, { status: 400 });
        }

        for (const u of usernames) {
            if (!/^[a-zA-Z0-9._]+$/.test(u)) {
                return NextResponse.json({ error: `Invalid username: ${u}` }, { status: 400 });
            }
        }

        const scriptPath = path.join(process.cwd(), "..", "post_deleter.py");
        const targets = usernames.join(",");

        const child = spawn(VENV_PYTHON, [scriptPath, "--targets", targets], {
            cwd: path.join(process.cwd(), ".."),
            detached: true,
            stdio: "ignore",
        });

        child.unref();

        return NextResponse.json({
            success: true,
            message: `Post deletion started for ${usernames.length} account(s). Check engine logs for progress.`
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
