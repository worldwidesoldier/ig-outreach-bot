"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import EngineControl from "@/components/EngineControl";
import Link from "next/link";
import { Users, Target, Mail, Activity, Cpu, TrendingUp, MessageCircle, Send, Reply, Zap } from "lucide-react";

export default function Home() {
    const [stats, setStats] = useState({ total: 0, healthy: 0, warming: 0, flagged: 0 });
    const [pipeline, setPipeline] = useState({ sent: 0, replied: 0, sentToday: 0, qualified: 0 });
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [campaignCount, setCampaignCount] = useState(0);

    useEffect(() => {
        fetchData();
        const channel = supabase.channel("home_realtime")
            .on("postgres_changes", { event: "*", schema: "public", table: "bot_activity_logs" }, fetchData)
            .on("postgres_changes", { event: "*", schema: "public", table: "outreach_logs" }, fetchData)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    async function fetchData() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString();

        const [botsRes, activityRes, campaignsRes, sentRes, repliedRes, sentTodayRes, qualifiedRes] = await Promise.all([
            supabase.from("accounts").select("status"),
            supabase.from("bot_activity_logs").select("*, accounts(username)").order("created_at", { ascending: false }).limit(6),
            supabase.from("campaigns").select("id", { count: "exact" }).eq("status", "ACTIVE"),
            supabase.from("outreach_logs").select("id", { count: "exact" }).eq("status", "SUCCESS"),
            supabase.from("leads").select("id", { count: "exact" }).eq("status", "REPLIED"),
            supabase.from("outreach_logs").select("id", { count: "exact" }).eq("status", "SUCCESS").gte("created_at", todayStr),
            supabase.from("leads").select("id", { count: "exact" }).in("status", ["PENDING", "QUALIFIED"]),
        ]);

        if (botsRes.data) {
            const bots = botsRes.data;
            setStats({
                total: bots.length,
                healthy: bots.filter(b => b.status === "HEALTHY").length,
                warming: bots.filter(b => b.status === "WARMING_UP").length,
                flagged: bots.filter(b => b.status === "CHALLENGE").length,
            });
        }
        if (activityRes.data) setRecentActivity(activityRes.data);
        if (campaignsRes.count !== null) setCampaignCount(campaignsRes.count);

        const sent = sentRes.count || 0;
        const replied = repliedRes.count || 0;
        setPipeline({
            sent,
            replied,
            sentToday: sentTodayRes.count || 0,
            qualified: qualifiedRes.count || 0,
        });
    }

    const replyRate = pipeline.sent > 0 ? ((pipeline.replied / pipeline.sent) * 100).toFixed(1) : "0.0";

    const quickLinks = [
        { name: "The Base", desc: "Manage bot accounts", href: "/accounts", icon: Users, color: "text-indigo-400", border: "hover:border-indigo-500/50" },
        { name: "Campaigns", desc: "Run outreach campaigns", href: "/campaigns", icon: Target, color: "text-emerald-400", border: "hover:border-emerald-500/50" },
        { name: "Templates", desc: "Edit message templates", href: "/templates", icon: Mail, color: "text-purple-400", border: "hover:border-purple-500/50" },
        { name: "Inbox", desc: "View all replies", href: "/inbox", icon: Reply, color: "text-amber-400", border: "hover:border-amber-500/50" },
    ];

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <header>
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm uppercase tracking-widest mb-2">
                        <Cpu className="w-4 h-4" />
                        Command Center
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight">ATLAS IG</h1>
                    <p className="text-slate-400 mt-1">Your private Instagram outreach intelligence system</p>
                </header>

                {/* Engine + Fleet */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <EngineControl />
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Fleet Status</p>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { label: "Total Bots", value: stats.total, color: "text-slate-100" },
                                { label: "Healthy", value: stats.healthy, color: "text-emerald-400" },
                                { label: "Warming Up", value: stats.warming, color: "text-amber-400" },
                                { label: "Challenge", value: stats.flagged, color: "text-rose-400" },
                            ].map(s => (
                                <div key={s.label}>
                                    <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                                    <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* KPI Metrics */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-2">
                        <div className="flex items-center gap-2 text-blue-400">
                            <Send className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Sent Today</span>
                        </div>
                        <p className="text-3xl font-extrabold text-slate-100">{pipeline.sentToday}</p>
                        <p className="text-xs text-slate-600">{pipeline.sent} total all time</p>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-2">
                        <div className="flex items-center gap-2 text-emerald-400">
                            <Reply className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Replied</span>
                        </div>
                        <p className="text-3xl font-extrabold text-emerald-400">{pipeline.replied}</p>
                        <p className="text-xs text-slate-600">from {pipeline.sent} DMs sent</p>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-2">
                        <div className="flex items-center gap-2 text-indigo-400">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Reply Rate</span>
                        </div>
                        <p className={`text-3xl font-extrabold ${parseFloat(replyRate) >= 5 ? "text-emerald-400" : parseFloat(replyRate) >= 2 ? "text-amber-400" : "text-slate-400"}`}>
                            {replyRate}%
                        </p>
                        <p className="text-xs text-slate-600">industry avg: 3-8%</p>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-2">
                        <div className="flex items-center gap-2 text-amber-400">
                            <Zap className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Ready to Send</span>
                        </div>
                        <p className="text-3xl font-extrabold text-amber-400">{pipeline.qualified.toLocaleString()}</p>
                        <p className="text-xs text-slate-600">{campaignCount} active campaigns</p>
                    </div>
                </div>

                {/* Quick Links */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {quickLinks.map((link) => (
                        <Link key={link.href} href={link.href}
                            className={`bg-slate-900/50 border border-slate-800 rounded-xl p-5 ${link.border} hover:bg-slate-900 transition-all group`}>
                            <link.icon className={`w-6 h-6 ${link.color} mb-3`} />
                            <p className="font-bold text-slate-100 text-sm">{link.name}</p>
                            <p className="text-xs text-slate-500 mt-1">{link.desc}</p>
                        </Link>
                    ))}
                </div>

                {/* Activity Feed */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-slate-800 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-400" />
                        <h2 className="font-bold text-slate-100 text-sm uppercase tracking-wider">Live Activity</h2>
                        <div className="ml-auto w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                    </div>
                    <div className="divide-y divide-slate-800">
                        {recentActivity.length === 0 && (
                            <p className="p-6 text-sm text-slate-500 italic text-center">No activity yet. Start the engine to begin.</p>
                        )}
                        {recentActivity.map((log) => (
                            <div key={log.id} className="p-4 flex items-start gap-3 hover:bg-slate-800/20 transition-colors">
                                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-indigo-400">@{log.accounts?.username}</span>
                                        <span className="text-[10px] text-slate-600">{new Date(log.created_at).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5 truncate">{log.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
