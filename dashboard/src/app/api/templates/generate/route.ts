import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
    try {
        const { niche, audience, tone } = await req.json();

        if (!niche || !audience) {
            return NextResponse.json({ error: "Missing niche or audience" }, { status: 400 });
        }

        const prompt = `You are an expert Instagram DM copywriter for outreach campaigns.

Generate 3 short Instagram DM templates for:
- Business/Niche: ${niche}
- Target audience: ${audience}
- Tone: ${tone || "casual and friendly"}

Rules:
- Use {full_name} variable for personalization
- Use spintax format {option1|option2|option3} for key phrases to avoid spam filters
- Keep each message under 160 characters
- Sound human, not salesy
- No emojis unless it fits naturally
- End with a soft call to action (not "click here" or "buy now")

Return ONLY a JSON array with 3 objects, each with "name" and "content" fields. No markdown, no explanation.
Example format:
[{"name": "Casual Invite", "content": "{Hey|Hi|Oi} {full_name}! ..."}]`;

        const response = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 600,
        });

        const raw = response.choices[0].message.content?.trim() || "[]";
        const templates = JSON.parse(raw);

        return NextResponse.json({ templates });
    } catch (error: any) {
        console.error("AI Generator error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
