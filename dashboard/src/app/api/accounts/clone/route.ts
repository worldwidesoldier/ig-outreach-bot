import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

function getPaths() {
    const engineDir = process.env.ENGINE_DIR ?? path.resolve(process.cwd(), "..");
    return {
        script: path.join(engineDir, "cloner.py"),
        python: process.env.VENV_PYTHON_PATH ?? path.join(engineDir, "venv", "bin", "python3"),
        cwd: engineDir,
    };
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { sourceUsername, targetBotUsernames, mode, imageUrl, caption } = body;

        const { script, python, cwd } = getPaths();
        const targets = (targetBotUsernames || []).join(",");

        if (!targets) {
            return NextResponse.json({ error: "No target bots selected" }, { status: 400 });
        }

        // Validate inputs
        if (sourceUsername && !/^[a-zA-Z0-9._]+$/.test(sourceUsername)) {
            return NextResponse.json({ error: "Invalid source username format" }, { status: 400 });
        }

        const spawnMode = mode || "profile";
        const args = [script, "--mode", spawnMode, "--targets", targets];

        if (spawnMode === "profile") {
            if (!sourceUsername) return NextResponse.json({ error: "sourceUsername required" }, { status: 400 });
            args.push("--source", sourceUsername);
        } else if (spawnMode === "post") {
            if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
            args.push("--image-url", imageUrl);
            if (caption) args.push("--caption", caption);
        }

        console.log(`[Clone API] mode=${spawnMode} targets=${targets}`);

        const child = spawn(python, args, { cwd, detached: true, stdio: "ignore" });
        child.unref();

        const messages: Record<string, string> = {
            profile: `Profile mirror started for ${targetBotUsernames.length} bot(s) from @${sourceUsername}. Runs with 3-5 min stagger between each account.`,
            post: `Post publishing started for ${targetBotUsernames.length} bot(s). Runs with 3-5 min stagger between each account.`,
        };

        return NextResponse.json({ success: true, message: messages[spawnMode] });
    } catch (error: any) {
        console.error("Clone API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
