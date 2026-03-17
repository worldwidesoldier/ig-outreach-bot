"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { List, Mail, Target } from "lucide-react";

export default function CampaignList({ campaigns }: { campaigns: any[] }) {
    const [progress, setProgress] = useState<Record<string, { total: number; sent: number }>>({});

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
                progressMap[camp.id] = {
                    total: totalRes.count || 0,
                    sent: sentRes.count || 0,
                };
            }));

            setProgress(progressMap);
        }
        fetchProgress();
    }, [campaigns]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((camp) => {
                const p = progress[camp.id];
                const pct = p && p.total > 0 ? Math.round((p.sent / p.total) * 100) : 0;

                return (
                    <div key={camp.id} className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl space-y-4 glassmorphism">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-slate-100">{camp.name}</h3>
                                <div className="flex items-center gap-4 mt-1">
                                    <span className="text-xs text-slate-500 flex items-center gap-1">
                                        <List className="w-3 h-3" />
                                        {camp.lead_lists?.name || "No List"}
                                    </span>
                                    <span className="text-xs text-slate-500 flex items-center gap-1">
                                        <Mail className="w-3 h-3" />
                                        {camp.message_templates?.name || "No Template"}
                                    </span>
                                </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${camp.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                                {camp.status}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm text-slate-400">
                            <span>Progress</span>
                            <span className="font-bold text-slate-200">{p ? `${p.sent} / ${p.total}` : "—"} <span className="text-slate-500 font-normal">({pct}%)</span></span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div className="bg-indigo-500 h-full transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="pt-4 flex gap-3">
                            <button className="flex-1 bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-sm font-medium transition-colors">Details</button>
                            <button className="flex-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 py-2 rounded-lg text-sm font-medium transition-colors">Launch</button>
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
    );
}
