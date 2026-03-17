import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const PID_FILE = path.join(process.cwd(), "../.engine.pid");
const PYTHON_SCRIPT = path.join(process.cwd(), "../scheduler.py");
const VENV_PYTHON = path.join(process.cwd(), "../venv/bin/python3");

export async function GET() {
    let isRunning = false;
    let pid = null;

    if (fs.existsSync(PID_FILE)) {
        pid = parseInt(fs.readFileSync(PID_FILE, "utf-8"));
        try {
            // Check if process is still alive
            process.kill(pid, 0);
            isRunning = true;
        } catch (e) {
            fs.unlinkSync(PID_FILE);
            isRunning = false;
        }
    }

    return NextResponse.json({ isRunning, pid });
}

export async function POST(req: Request) {
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
