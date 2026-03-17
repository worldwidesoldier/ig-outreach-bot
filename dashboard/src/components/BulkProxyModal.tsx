"use client";

import { useState } from "react";
import { X, Globe, Shield, Loader2, Link2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function BulkProxyModal({ isOpen, onClose, selectedIds, onAssigned }: {
    isOpen: boolean;
    onClose: () => void;
    selectedIds: string[];
    onAssigned: () => void;
}) {
    const [proxyString, setProxyString] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    if (!isOpen) return null;

    async function handleAssign() {
        if (!proxyString) {
            setError("Please enter a proxy string");
            return;
        }

        const proxyRegex = /^https?:\/\/(.+:.+@)?[^:\s]+:\d+$/;
        if (!proxyRegex.test(proxyString.trim())) {
            setError("Invalid proxy format. Expected: http://user:pass@ip:port or http://ip:port");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const { error: updateError } = await supabase
                .from("accounts")
                .update({ proxy: proxyString })
                .in("id", selectedIds);

            if (updateError) throw updateError;

            onAssigned();
            setProxyString("");
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl shadow-indigo-500/10 overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                            <Globe className="w-5 h-5 text-indigo-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white">Bulk Assign Proxy</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
                        <div className="flex gap-3">
                            <Shield className="w-5 h-5 text-amber-500 shrink-0" />
                            <p className="text-xs text-amber-200/80 leading-relaxed">
                                You are assigning this proxy to <span className="font-bold text-amber-400">{selectedIds.length} accounts</span>.
                                Make sure it is a high-quality 4G/5G proxy to avoid chain bans.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Proxy Link / Credentials</label>
                        <div className="relative">
                            <Link2 className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="http://user:pass@ip:port"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                                value={proxyString}
                                onChange={(e) => setProxyString(e.target.value)}
                            />
                        </div>
                        <p className="text-[10px] text-slate-500 ml-1 mt-1 italic">
                            Tip: Proxy-Cheap usually provides proxies in the http://user:pass@ip:port format.
                        </p>
                    </div>

                    {error && (
                        <div className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-6 bg-slate-900/50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-slate-400 hover:bg-slate-800 transition-all border border-slate-800"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAssign}
                        disabled={loading || !proxyString}
                        className="flex-[2] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 rounded-xl font-bold text-sm text-white transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Assign to Fleet
                    </button>
                </div>
            </div>
        </div>
    );
}
