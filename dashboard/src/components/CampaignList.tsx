"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { List, Mail, Play, Pause, Trash2, X, Info, User, Clock, Send, Reply, Calendar, Zap } from "lucide-react";

function NextCycleBadge() {
    const [next, setNext] = useState<string>("");
    const [countdown, setCountdown] = useState<string>("");

    useEffect(() => {
        function compute() {
            const now = new Date();
            const cycles = [13, 18, 21];
            let nextTime: Date | null = null;

            for (const h of cycles) {
                const t = new Date(now);
                t.setHours(h, 0, 0, 0);
                if (t > now) { nextTime = t; break; }
            }

            if (!nextTime) {
                // Tomorrow 13:00
                nextTime = new Date(now);
                nextTime.setDate(nextTime.getDate() + 1);
                nextTime.setHours(13, 0, 0, 0);
            }

            const diff = nextTime.getTime() - now.getTime();
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);

            setNext(nextTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
            setCountdown(`${h}h ${m}m ${s}s`);
        }

        compute();
        const interval = setInterval(compute, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Next cycle at {next}</p>
                <p className="text-xs font-bold text-indigo-300">{countdown}</p>
            </div>
        </div>
    );
}

export default function CampaignList({ campaigns, onRefresh }: { campaigns: any[]; onRefresh?: () => void }) {
    const [progress, setProgress] = useState<Record<string, { total: number; sent: number; replied: number }>>({});
    const [detailsCamp, setDetailsCamp] = useState<any>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    useEffect(() => {
        async function fetchProgress() {
            if (campaigns.length === 0) return;
            const progressMap: Record<string, { total: number; sent: number; replied: number }> = {};
            await Promise.all(campaigns.map(async (camp) => {
                if (!camp.list_id) return;
                const [totalRes, sentRes, repliedRes] = await Promise.all([
                    supabase.from("leads").select("id", { count: "exact" }).eq("list_id", camp.list_id),
                    supabase.from("leads").select("id", { count: "exact" }).eq("list_id", camp.list_id).in("status", ["SENT", "FOLLOWED_UP", "REPLIED"]),
                    supabase.from("leads").select("id", { count: "exact" }).eq("list_id", camp.list_id).eq("status", "REPLIED"),
                ]);
                progressMap[camp.id] = {
                    total: totalRes.count || 0,
                    sent: sentRes.count || 0,
                    replied: repliedRes.count || 0,
                };
            }));
            setProgress(progressMap);
        }
        fetchProgress();
    }, [campaigns]);

    async function toggleStatus(camp: any) {
        const newStatus = camp.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
        setLoadingId(camp.id);
        await supabase.from("campaigns").update({ status: newStatus }).eq("id", camp.id);
        setLoadingId(null);
        onRefresh?.();
    }

    async function deleteCampaign(camp: any) {
        if (!confirm(`Delete campaign "${camp.name}"? This cannot be undone.`)) return;
        setLoadingId(camp.id);
        await supabase.from("campaigns").delete().eq("id", camp.id);
        setLoadingId(null);
        onRefresh?.();
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map((camp) => {
                    const p = progress[camp.id];
                    const pct = p && p.total > 0 ? Math.round((p.sent / p.total) * 100) : 0;
                    const isLoading = loadingId === camp.id;
                    const isActive = camp.status === "ACTIVE";

                    return (
                        <div key={camp.id} className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl space-y-4 hover:border-slate-700 transition-colors">
                            <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0 pr-2">
                                    <h3 className="text-lg font-bold text-slate-100 truncate">{camp.name}</h3>
                                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                            <List className="w-3 h-3 shrink-0" />
                                            {camp.lead_lists?.name || "No List"}
                                        </span>
                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                            <Mail className="w-3 h-3 shrink-0" />
                                            {camp.message_templates?.name || "No Template"}
                                        </span>
                                        {camp.accounts && (
                                            <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <User className="w-3 h-3" />
                                                @{camp.accounts.username}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"}`}>
                                    {camp.status}
                                </span>
                            </div>

                            {/* Progress */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm text-slate-400">
                                    <span>Sent</span>
                                    <span className="font-bold text-slate-200">
                                        {p ? `${p.sent} / ${p.total}` : "—"} <span className="text-slate-500 font-normal">({pct}%)</span>
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-indigo-500 h-full transition-all duration-700" style={{ width: `${pct}%` }} />
                                </div>
                                {p && p.replied > 0 && (
                                    <p className="text-xs text-emerald-400 font-medium">🔥 {p.replied} replied</p>
                                )}
                            </div>

                            {/* Next cycle */}
                            {isActive && <NextCycleBadge />}

                            <div className="pt-1 flex gap-2">
                                <button
                                    onClick={() => setDetailsCamp(camp)}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                                >
                                    <Info className="w-3.5 h-3.5" />
                                    Details
                                </button>

                                <button
                                    onClick={() => toggleStatus(camp)}
                                    disabled={isLoading}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${isActive
                                        ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400"
                                        : "bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400"
                                        }`}
                                >
                                    {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                    {isActive ? "Pause" : "Launch"}
                                </button>

                                <button
                                    onClick={() => deleteCampaign(camp)}
                                    disabled={isLoading}
                                    className="px-3 py-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
                {campaigns.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/30 border border-dashed border-slate-800 rounded-xl">
                        No campaigns created yet. Start by defining your first target.
                    </div>
                )}
            </div>

            {/* Details Modal */}
            {detailsCamp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDetailsCamp(null)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-100">{detailsCamp.name}</h2>
                            <button onClick={() => setDetailsCamp(null)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors">
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>

                        {/* Stats row */}
                        {progress[detailsCamp.id] && (
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { icon: Send, label: "Sent", value: progress[detailsCamp.id].sent, color: "text-blue-400" },
                                    { icon: Reply, label: "Replied", value: progress[detailsCamp.id].replied, color: "text-emerald-400" },
                                    { icon: Zap, label: "Remaining", value: progress[detailsCamp.id].total - progress[detailsCamp.id].sent, color: "text-indigo-400" },
                                ].map(({ icon: Icon, label, value, color }) => (
                                    <div key={label} className="bg-slate-800/60 rounded-xl p-3 text-center">
                                        <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
                                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                                        <p className="text-[10px] text-slate-500">{label}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Info rows */}
                        <div className="space-y-2 text-sm">
                            {[
                                { label: "Status", value: detailsCamp.status },
                                { label: "Bot", value: detailsCamp.accounts ? `@${detailsCamp.accounts.username}` : "All healthy bots" },
                                { label: "Lead List", value: detailsCamp.lead_lists?.name || "—" },
                                { label: "Step 1 Template", value: detailsCamp.message_templates?.name || "—" },
                                { label: "Created", value: new Date(detailsCamp.created_at).toLocaleDateString() },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between py-2 border-b border-slate-800">
                                    <span className="text-slate-500">{label}</span>
                                    <span className="text-slate-200 font-medium">{value}</span>
                                </div>
                            ))}
                        </div>

                        {/* Schedule */}
                        <div className="bg-slate-800/40 rounded-xl p-4 space-y-2">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5" />
                                Daily Schedule
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                                {["13:00", "18:00", "21:00"].map(time => (
                                    <div key={time} className="bg-slate-900 rounded-lg px-3 py-2 text-center">
                                        <p className="text-sm font-bold text-indigo-300">{time}</p>
                                        <p className="text-[10px] text-slate-500">3 DMs</p>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-slate-600 text-center">4-6 min between each DM · 9/day total</p>
                        </div>

                        {/* Next cycle countdown */}
                        <NextCycleBadge />
                    </div>
                </div>
            )}
        </>
    );
}
