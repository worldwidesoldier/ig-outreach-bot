import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// Use env vars for Python paths — avoids Turbopack following venv symlinks during build
function getPaths() {
    const engineDir = process.env.ENGINE_DIR ?? path.resolve(process.cwd(), "..");
    return {
        PID_FILE: path.join(engineDir, ".engine.pid"),
        PYTHON_SCRIPT: path.join(engineDir, "scheduler.py"),
        VENV_PYTHON: process.env.VENV_PYTHON_PATH ?? path.join(engineDir, "venv", "bin", "python3"),
    };
}

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
    const { PID_FILE } = getPaths();
    let isRunning = false;
    let pid = null;

    // 1. First check local process (for local dev)
    if (fs.existsSync(PID_FILE)) {
        pid = parseInt(fs.readFileSync(PID_FILE, "utf-8"));
        try {
            process.kill(pid, 0);
            isRunning = true;
        } catch (e) {
            try { fs.unlinkSync(PID_FILE); } catch { }
        }
    }

    // 2. If not found locally, check Distributed Heartbeat in Supabase
    if (!isRunning) {
        const { data } = await supabase
            .from("system_status")
            .select("last_heartbeat")
            .eq("id", "engine")
            .single();

        if (data?.last_heartbeat) {
            const lastHeartbeat = new Date(data.last_heartbeat).getTime();
            const now = new Date().getTime();
            // If heartbeat was within last 3 minutes, consider it online
            if (now - lastHeartbeat < 180000) {
                isRunning = true;
            }
        }
    }

    return NextResponse.json({ isRunning, pid });
}

export async function POST(req: Request) {
    const { PID_FILE, PYTHON_SCRIPT, VENV_PYTHON } = getPaths();
    const { action } = await req.json();

    if (action === "start") {
        if (fs.existsSync(PID_FILE)) {
            return NextResponse.json({ message: "Engine already running" }, { status: 400 });
        }

        const child = spawn(VENV_PYTHON, [PYTHON_SCRIPT], {
            detached: true,
            stdio: "ignore",
            cwd: path.join(process.cwd(), "..")
        });

        child.unref();

        if (child.pid) {
            fs.writeFileSync(PID_FILE, child.pid.toString());
            return NextResponse.json({ message: "Engine started", pid: child.pid });
        }

        return NextResponse.json({ message: "Failed to start engine" }, { status: 500 });
    }

    if (action === "stop") {
        if (!fs.existsSync(PID_FILE)) {
            return NextResponse.json({ message: "Engine not running" }, { status: 400 });
        }

        const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8"));
        try {
            process.kill(pid, "SIGTERM");
            fs.unlinkSync(PID_FILE);
            return NextResponse.json({ message: "Engine stopped" });
        } catch (e) {
            fs.unlinkSync(PID_FILE);
            return NextResponse.json({ message: "Engine process not found, cleaned up PID file" });
        }
    }

    return NextResponse.json({ message: "Invalid action" }, { status: 400 });
}
