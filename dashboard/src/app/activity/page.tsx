"use client";

import { useState, useEffect } from "react";
import { Activity, Clock, User, MessageSquare, Heart, MousePointerClick as Mouse, RefreshCw, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ActivityPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 5000); // Live updates
        return () => clearInterval(interval);
    }, []);

    async function fetchLogs() {
        const { data } = await supabase
            .from("bot_activity_logs")
            .select("*, accounts(username)")
            .order("created_at", { ascending: false })
            .limit(50);

        if (data) setLogs(data);
        setLoading(false);
    }

    const getActivityIcon = (type: string) => {
        switch (type) {
            case "WARMUP_SCROLL": return <Mouse className="w-4 h-4 text-slate-400" />;
            case "WARMUP_STORY": return <Eye className="w-4 h-4 text-purple-400" />;
            case "WARMUP_LIKE": return <Heart className="w-4 h-4 text-rose-500" />;
            case "WARMUP_FOLLOW": return <User className="w-4 h-4 text-indigo-400" />;
            case "DM_SEND": return <MessageSquare className="w-4 h-4 text-emerald-400" />;
            default: return <RefreshCw className="w-4 h-4 text-slate-500" />;
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
                        <Activity className="w-8 h-8 text-indigo-500" />
                        Live activity Feed
                    </h1>
                    <p className="text-slate-400 mt-2">Real-time audit of every action your bots take.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full animate-pulse border border-emerald-500/20">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                    LIVE STREAMING
                </div>
            </header>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
                {loading && (
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-10 text-slate-400">
                        Loading stream...
                    </div>
                )}
                <div className="divide-y divide-slate-800">
                    {logs.map((log) => (
                        <div key={log.id} className="p-5 flex items-start gap-4 hover:bg-slate-800/20 transition-all group">
                            <div className="mt-1 p-2 bg-slate-950 rounded-lg border border-slate-800 group-hover:border-indigo-500/30 transition-colors">
                                {getActivityIcon(log.activity_type)}
                            </div>
                            <div className="flex-1 space-y-1">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-indigo-400">@{log.accounts?.username || "bot"}</span>
                                    <span className="text-[10px] text-slate-500 flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                        <Clock className="w-3 h-3" />
                                        {new Date(log.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                </div>
                                <p className="text-slate-300 text-sm leading-relaxed">{log.description}</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 bg-slate-950 px-2 py-0.5 rounded">
                                        {log.activity_type.replace("WARMUP_", "").replace("_", " ")}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {logs.length === 0 && !loading && (
                        <div className="p-20 text-center text-slate-500 italic">
                            Waiting for bot activity locally or in production...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
