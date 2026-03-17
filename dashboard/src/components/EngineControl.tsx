"use client";

import { useState, useEffect } from "react";
import { Play, Square, Loader2, ShieldCheck, ShieldAlert, Cpu } from "lucide-react";

export default function EngineControl() {
    const [status, setStatus] = useState<{ isRunning: boolean; pid: number | null }>({ isRunning: false, pid: null });
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    async function checkStatus() {
        try {
            const res = await fetch("/api/engine");
            const data = await res.json();
            setStatus(data);
        } catch (e) {
            console.error("Failed to check engine status");
        }
        setLoading(false);
    }

    async function handleAction(action: "start" | "stop") {
        setActionLoading(true);
        try {
            await fetch("/api/engine", {
                method: "POST",
                body: JSON.stringify({ action }),
            });
            await checkStatus();
        } catch (e) {
            alert("Error managing the engine service.");
        }
        setActionLoading(false);
    }

    if (loading) return null;

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl overflow-hidden relative group">
            <div className="flex justify-between items-start relative z-10">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Cpu className={`w-5 h-5 ${status.isRunning ? 'text-emerald-500' : 'text-slate-500'}`} />
                        <h3 className="font-bold text-slate-100 uppercase tracking-wider text-sm">Automation Engine</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${status.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                        <span className={`text-xs font-bold ${status.isRunning ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {status.isRunning ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
                        </span>
                        {status.pid && <span className="text-[10px] text-slate-600 font-mono">PID: {status.pid}</span>}
                    </div>
                </div>

                <button
                    onClick={() => handleAction(status.isRunning ? "stop" : "start")}
                    disabled={actionLoading}
                    className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all ${status.isRunning
                            ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'
                            : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        }`}
                >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (status.isRunning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />)}
                    {status.isRunning ? 'Stop Service' : 'Power On'}
                </button>
            </div>

            <p className="mt-4 text-xs text-slate-500 leading-relaxed border-t border-slate-800/50 pt-4">
                {status.isRunning
                    ? "The background engine is currently processing your outreach campaigns, warmup schedules, and scraping tasks autonomously."
                    : "The automation engine is currently dormant. Turn it on to begin executing your queued tasks and schedules."}
            </p>

            {/* Background design element */}
            <div className={`absolute -right-4 -bottom-4 w-24 h-24 blur-3xl opacity-20 pointer-events-none transition-colors duration-1000 ${status.isRunning ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
        </div>
    );
}
