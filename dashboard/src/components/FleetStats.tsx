export default function FleetStats({ bots }: { bots: any[] }) {
    const activeBots = bots.filter((b) => b.status === "HEALTHY").length;
    const warmingBots = bots.filter((b) => b.status === "WARMING_UP").length;
    const flaggedBots = bots.filter((b) => b.status === "FLAGGED" || b.status === "CHALLENGE").length;

    const stats = [
        { label: "Total Bots", value: bots.length, color: "text-indigo-400" },
        { label: "Active & Healthy", value: activeBots, color: "text-emerald-400" },
        { label: "Warming Up", value: warmingBots, color: "text-amber-400" },
        { label: "Flagged", value: flaggedBots, color: "text-rose-400" },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat) => (
                <div key={stat.label} className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl space-y-2 glassmorphism">
                    <p className="text-sm font-medium text-slate-400">{stat.label}</p>
                    <p className={`text-4xl font-bold ${stat.color}`}>{stat.value}</p>
                </div>
            ))}
        </div>
    );
}
