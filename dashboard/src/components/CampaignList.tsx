"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { List, Mail, Play, Pause, Trash2, X, Info } from "lucide-react";

export default function CampaignList({ campaigns, onRefresh }: { campaigns: any[]; onRefresh?: () => void }) {
    const [progress, setProgress] = useState<Record<string, { total: number; sent: number }>>({});
    const [detailsCamp, setDetailsCamp] = useState<any>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    useEffect(() => {
        async function fetchProgress() {
            if (campaigns.length === 0) return;
            const progressMap: Record<string, { total: number; sent: number }> = {};
            await Promise.all(campaigns.map(async (camp) => {
                if (!camp.list_id) return;
                const [totalRes, sentRes] = await Promise.all([
                    supabase.from("leads").select("id", { count: "exact" }).eq("list_id", camp.list_id),
                    supabase.from("leads").select("id", { count: "exact" }).eq("list_id", camp.list_id).eq("status", "SENT"),
                ]);
                progressMap[camp.id] = { total: totalRes.count || 0, sent: sentRes.count || 0 };
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
                                    </div>
                                </div>
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"}`}>
                                    {camp.status}
                                </span>
                            </div>

                            <div className="flex justify-between text-sm text-slate-400">
                                <span>Progress</span>
                                <span className="font-bold text-slate-200">
                                    {p ? `${p.sent} / ${p.total}` : "—"} <span className="text-slate-500 font-normal">({pct}%)</span>
                                </span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-indigo-500 h-full transition-all duration-700" style={{ width: `${pct}%` }} />
                            </div>

                            <div className="pt-2 flex gap-2">
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
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                                        isActive
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
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-100">{detailsCamp.name}</h2>
                            <button onClick={() => setDetailsCamp(null)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors">
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>
                        <div className="space-y-3 text-sm">
                            {[
                                { label: "Status", value: detailsCamp.status },
                                { label: "Lead List", value: detailsCamp.lead_lists?.name || "—" },
                                { label: "Template", value: detailsCamp.message_templates?.name || "—" },
                                { label: "Leads Sent", value: progress[detailsCamp.id] ? `${progress[detailsCamp.id].sent} / ${progress[detailsCamp.id].total}` : "—" },
                                { label: "Created", value: new Date(detailsCamp.created_at).toLocaleDateString() },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between py-2 border-b border-slate-800">
                                    <span className="text-slate-500">{label}</span>
                                    <span className="text-slate-200 font-medium">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
