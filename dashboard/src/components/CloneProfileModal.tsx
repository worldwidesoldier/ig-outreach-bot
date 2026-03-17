"use client";

import { useState } from "react";
import { X, Copy } from "lucide-react";

export default function CloneProfileModal({ isOpen, onClose, selectedBots }: {
    isOpen: boolean,
    onClose: () => void,
    selectedBots: any[]
}) {
    const [sourceUsername, setSourceUsername] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    if (!isOpen) return null;

    async function handleClone() {
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/accounts/clone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceUsername,
                    targetBotIds: selectedBots.map(b => b.id)
                }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Failed to clone profiles");

            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                            <Copy className="w-5 h-5 text-indigo-400" />
                            Mirror Profile
                        </h2>
                        <p className="text-sm text-slate-400">Clone Bio & Avatar to {selectedBots.length} bots</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Source Instagram Username</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">@</span>
                            <input
                                type="text"
                                value={sourceUsername}
                                onChange={(e) => setSourceUsername(e.target.value)}
                                placeholder="your_human_account"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-2">
                        <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Targets</p>
                        <div className="flex flex-wrap gap-2">
                            {selectedBots.map(bot => (
                                <span key={bot.id} className="text-xs bg-slate-800 px-2 py-1 rounded border border-slate-700">@{bot.username}</span>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-500">
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleClone}
                        disabled={loading || !sourceUsername.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-semibold text-sm transition-all shadow-lg shadow-indigo-500/20"
                    >
                        {loading ? "Starting Mirroring..." : "Clone to All Selected"}
                    </button>
                </div>
            </div>
        </div>
    );
}
