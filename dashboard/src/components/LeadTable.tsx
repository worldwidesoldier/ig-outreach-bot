import { MessageCircle, MessageCircleCheck, Clock, CheckCircle, XCircle, Zap, AlertCircle } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    PENDING:     { label: "Scoring...",   className: "bg-slate-500/10 text-slate-400 border-slate-700",           icon: <Clock className="w-3 h-3" /> },
    QUALIFIED:   { label: "Ready",       className: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",     icon: <Zap className="w-3 h-3" /> },
    REJECTED:    { label: "Filtered",    className: "bg-slate-700/30 text-slate-600 border-slate-800",           icon: <XCircle className="w-3 h-3" /> },
    SENDING:     { label: "Sending…",    className: "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse", icon: <MessageCircle className="w-3 h-3" /> },
    SENT:        { label: "Step 1 Sent", className: "bg-blue-500/10 text-blue-400 border-blue-500/30",           icon: <MessageCircle className="w-3 h-3" /> },
    FOLLOWED_UP: { label: "Step 2 Sent", className: "bg-purple-500/10 text-purple-400 border-purple-500/30",    icon: <MessageCircleCheck className="w-3 h-3" /> },
    REPLIED:     { label: "REPLIED 🔥",  className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 font-bold", icon: <CheckCircle className="w-3 h-3" /> },
    FAILED:      { label: "Failed",      className: "bg-rose-500/10 text-rose-400 border-rose-500/30",           icon: <AlertCircle className="w-3 h-3" /> },
};

function ScoreBadge({ score }: { score: number | null }) {
    if (score === null || score === undefined) return <span className="text-slate-600 text-xs">—</span>;
    const color = score >= 70 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-rose-400";
    return <span className={`text-xs font-bold ${color}`}>{score}</span>;
}

export default function LeadTable({ leads }: { leads: any[] }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/80 text-xs font-semibold uppercase text-slate-500 border-b border-slate-800">
                    <tr>
                        <th className="px-5 py-3">Username</th>
                        <th className="px-5 py-3">Full Name</th>
                        <th className="px-5 py-3 text-center">AI Score</th>
                        <th className="px-5 py-3">Outreach Status</th>
                        <th className="px-5 py-3">Followers</th>
                        <th className="px-5 py-3">List</th>
                        <th className="px-5 py-3">Captured</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                    {leads.map((lead) => {
                        const statusCfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG["PENDING"];
                        return (
                            <tr
                                key={lead.id}
                                className={`hover:bg-slate-800/30 transition-colors text-sm ${lead.status === "REPLIED" ? "bg-emerald-500/5" : ""}`}
                            >
                                <td className="px-5 py-3 font-medium text-slate-200">@{lead.username}</td>
                                <td className="px-5 py-3 text-slate-400">{lead.full_name || "—"}</td>
                                <td className="px-5 py-3 text-center">
                                    <ScoreBadge score={lead.lead_quality_score} />
                                </td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${statusCfg.className}`}>
                                        {statusCfg.icon}
                                        {statusCfg.label}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-slate-400 text-xs">
                                    {lead.follower_count ? lead.follower_count.toLocaleString() : "—"}
                                </td>
                                <td className="px-5 py-3">
                                    <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs border border-slate-700">
                                        {lead.lead_lists?.name || "—"}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-slate-500 text-xs">
                                    {new Date(lead.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        );
                    })}
                    {leads.length === 0 && (
                        <tr>
                            <td colSpan={7} className="px-6 py-16 text-center text-slate-600 italic">
                                No leads found. Start a scrape task to populate this list.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
