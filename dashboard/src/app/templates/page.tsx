"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Mail, Trash2, Save, Sparkles, Loader2, Copy, Eye } from "lucide-react";

export default function TemplatesPage() {
    const [templates, setTemplates] = useState<any[]>([]);
    const [editingTemplate, setEditingTemplate] = useState<any>(null);
    const [name, setName] = useState("");
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);

    // Spintax preview
    const [preview, setPreview] = useState("");

    function resolvePreview() {
        let text = content
            .replace(/\{full_name\}/g, "John")
            .replace(/\{username\}/g, "john.doe");
        // Resolve spintax {a|b|c}
        while (/\{[^{}|]+\|[^{}]*\}/.test(text)) {
            text = text.replace(/\{([^{}]+)\}/g, (_, inner) => {
                if (inner.includes("|")) {
                    const opts = inner.split("|");
                    return opts[Math.floor(Math.random() * opts.length)];
                }
                return _;
            });
        }
        setPreview(text);
    }

    // AI Generator
    const [aiOpen, setAiOpen] = useState(false);
    const [aiNiche, setAiNiche] = useState("");
    const [aiAudience, setAiAudience] = useState("");
    const [aiTone, setAiTone] = useState("casual and friendly");
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResults, setAiResults] = useState<{ name: string; content: string }[]>([]);

    useEffect(() => { fetchTemplates(); }, []);

    async function fetchTemplates() {
        const { data } = await supabase.from("message_templates").select("*").order("created_at", { ascending: false });
        if (data) setTemplates(data);
    }

    async function handleSave() {
        if (!name || !content) return;
        setLoading(true);
        const data = { name, content };
        let error;
        if (editingTemplate) {
            const res = await supabase.from("message_templates").update(data).eq("id", editingTemplate.id);
            error = res.error;
        } else {
            const res = await supabase.from("message_templates").insert(data);
            error = res.error;
        }
        if (!error) { setName(""); setContent(""); setEditingTemplate(null); fetchTemplates(); }
        setLoading(false);
    }

    async function handleDelete(id: string) {
        await supabase.from("message_templates").delete().eq("id", id);
        fetchTemplates();
    }

    async function handleAIGenerate() {
        if (!aiNiche || !aiAudience) return;
        setAiLoading(true);
        setAiResults([]);
        try {
            const res = await fetch("/api/templates/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ niche: aiNiche, audience: aiAudience, tone: aiTone })
            });
            const data = await res.json();
            if (data.templates) setAiResults(data.templates);
        } catch (e) {
            console.error(e);
        }
        setAiLoading(false);
    }

    async function handleUseAITemplate(tpl: { name: string; content: string }) {
        setName(tpl.name);
        setContent(tpl.content);
        setAiOpen(false);
        setAiResults([]);
    }

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <header className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
                        <Mail className="w-8 h-8 text-indigo-500" />
                        Templates
                    </h1>
                    <p className="text-slate-400 mt-1">Craft personalized outreach messages with spintax support.</p>
                </div>
                <button
                    onClick={() => setAiOpen(v => !v)}
                    className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 hover:text-indigo-300 px-4 py-2 rounded-lg text-sm font-bold transition-all"
                >
                    <Sparkles className="w-4 h-4" />
                    Generate with AI
                </button>
            </header>

            {/* AI Generator Panel */}
            {aiOpen && (
                <div className="bg-slate-900 border border-indigo-500/20 rounded-2xl p-6 space-y-4 shadow-xl shadow-indigo-500/5">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <span className="text-sm font-bold text-indigo-400 uppercase tracking-widest">AI Message Generator</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Your Business / Niche</label>
                            <input
                                value={aiNiche}
                                onChange={e => setAiNiche(e.target.value)}
                                placeholder="Bar & restaurant in Miami"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Target Audience</label>
                            <input
                                value={aiAudience}
                                onChange={e => setAiAudience(e.target.value)}
                                placeholder="Young professionals in Miami"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Tone</label>
                            <select
                                value={aiTone}
                                onChange={e => setAiTone(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm appearance-none"
                            >
                                <option value="casual and friendly">Casual & Friendly</option>
                                <option value="professional">Professional</option>
                                <option value="excited and energetic">Excited & Energetic</option>
                                <option value="mysterious and exclusive">Mysterious & Exclusive</option>
                            </select>
                        </div>
                    </div>
                    <button
                        onClick={handleAIGenerate}
                        disabled={aiLoading || !aiNiche || !aiAudience}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-6 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-all"
                    >
                        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {aiLoading ? "Generating..." : "Generate 3 Templates"}
                    </button>

                    {aiResults.length > 0 && (
                        <div className="space-y-3 pt-2">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Generated — click to use</p>
                            {aiResults.map((tpl, i) => (
                                <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-4 hover:border-indigo-500/40 transition-all">
                                    <div className="space-y-1 flex-1">
                                        <p className="text-xs font-bold text-indigo-400">{tpl.name}</p>
                                        <p className="text-sm text-slate-300 font-mono">{tpl.content}</p>
                                    </div>
                                    <button
                                        onClick={() => handleUseAITemplate(tpl)}
                                        className="flex-shrink-0 text-xs bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all"
                                    >
                                        <Copy className="w-3 h-3" />
                                        Use
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Editor */}
                <div className="lg:col-span-1">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Template Name</label>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Casual Miami Invite"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Message Content</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="{Hey|Hi|Hello} {full_name}! Loved your vibe..."
                                className="w-full h-48 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono text-sm"
                            />
                        </div>

                        {/* Variables & Spintax hint */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Variables</p>
                            <div className="flex flex-wrap gap-1.5">
                                {["{full_name}", "{username}"].map(v => (
                                    <button key={v} onClick={() => setContent(c => c + v)}
                                        className="text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-indigo-400 px-2 py-0.5 rounded border border-slate-700 transition-all">
                                        {v}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Spintax</p>
                            <p className="text-[10px] text-slate-600 font-mono">{"{Hey|Hi|Hello}"} → picks 1 randomly</p>
                        </div>

                        {/* Spintax Preview */}
                        {content && (
                            <div className="space-y-2">
                                <button
                                    onClick={resolvePreview}
                                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 py-2 rounded-lg transition-all"
                                >
                                    <Eye className="w-3.5 h-3.5" />
                                    Preview Message
                                </button>
                                {preview && (
                                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3">
                                        <p className="text-[10px] font-bold text-indigo-400 uppercase mb-1">Preview (John / john.doe)</p>
                                        <p className="text-sm text-slate-200">{preview}</p>
                                        <button onClick={resolvePreview} className="text-[10px] text-slate-500 hover:text-slate-400 mt-1 transition-colors">
                                            Roll again →
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={loading || !name || !content}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                        >
                            <Save className="w-5 h-5" />
                            {editingTemplate ? "Update Template" : "Save Template"}
                        </button>
                        {editingTemplate && (
                            <button onClick={() => { setEditingTemplate(null); setName(""); setContent(""); }}
                                className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors">
                                Cancel Edit
                            </button>
                        )}
                    </div>
                </div>

                {/* Library */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-lg font-bold text-slate-400 uppercase tracking-widest px-1">Saved Library</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {templates.map((tpl) => (
                            <div key={tpl.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4 hover:border-indigo-500/50 transition-all shadow-lg flex flex-col justify-between">
                                <div className="space-y-3">
                                    <h3 className="text-lg font-bold text-slate-200">{tpl.name}</h3>
                                    <p className="text-sm text-slate-500 line-clamp-3 font-mono">"{tpl.content}"</p>
                                </div>
                                <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                                    <button
                                        onClick={() => { setEditingTemplate(tpl); setName(tpl.name); setContent(tpl.content); }}
                                        className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                                    >
                                        Edit
                                    </button>
                                    <button onClick={() => handleDelete(tpl.id)} className="text-slate-600 hover:text-rose-500 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {templates.length === 0 && (
                            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-2xl text-slate-600">
                                No templates yet. Create one or generate with AI.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
