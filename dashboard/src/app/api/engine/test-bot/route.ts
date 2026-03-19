import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

// Use env vars for Python paths — avoids Turbopack following venv symlinks during build
function getPaths() {
    const engineDir = process.env.ENGINE_DIR ?? path.resolve(process.cwd(), "..");
    return {
        VENV_PYTHON: process.env.VENV_PYTHON_PATH ?? path.join(engineDir, "venv", "bin", "python3"),
        ENGINE_DIR: engineDir,
    };
}

export async function POST(req: Request) {
    const { VENV_PYTHON, ENGINE_DIR } = getPaths();
    const { username } = await req.json();
    if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

    // Runs a single-bot login test in the background
    // bot_utils.get_client will auto-resolve TOTP or mark CHALLENGE if SMS needed
    const script = `
import sys
sys.path.insert(0, '${ENGINE_DIR}')
from brain_reporter import BrainReporter
from bot_utils import get_client

reporter = BrainReporter()
res = reporter.client.table('accounts').select('*').eq('username', '${username}').single().execute()
bot = res.data
if not bot:
    print('Bot not found')
    sys.exit(1)

try:
    client = get_client(
        username=bot['username'],
        password=bot['password'],
        proxy=bot.get('proxy'),
        two_factor_seed=bot.get('two_factor_seed'),
        session_file=f"sessions/{bot['username']}.json"
    )
    reporter.report_status(bot['username'], 'WARMING_UP', warmup_day=bot.get('warmup_day') or 0)
    print(f"OK: @{bot['username']} login successful")
except Exception as e:
    print(f"FAILED: @{bot['username']} — {e}")
`;

    spawn(VENV_PYTHON, ["-c", script], {
        detached: true,
        stdio: "ignore",
        cwd: ENGINE_DIR
    }).unref();

    return NextResponse.json({ message: `Login test started for @${username}` });
}
