"use client";

import { useState } from "react";
import { Shield, ShieldAlert, ShieldCheck, Trash2, RefreshCw, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

const WARMUP_SESSIONS = 21; // backend increments per scheduler run (3x/day × 7 days)
const WARMUP_DAYS = 7;     // display to user in real calendar days

export default function AccountTable({ accounts, selectedIds, onSelectChange, onDelete, onRefresh }: {
    accounts: any[],
    selectedIds: string[],
    onSelectChange: (ids: string[]) => void,
    onDelete?: (id: string) => void,
    onRefresh?: () => void
}) {

    const toggleSelectAll = () => {
        if (selectedIds.length === accounts.length) {
            onSelectChange([]);
        } else {
            onSelectChange(accounts.map(a => a.id));
        }
    };

    const toggleSelectOne = (id: string) => {
        if (selectedIds.includes(id)) {
            onSelectChange(selectedIds.filter(selectedId => selectedId !== id));
        } else {
            onSelectChange([...selectedIds, id]);
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/80 text-xs font-semibold uppercase text-slate-500 border-b border-slate-800">
                    <tr>
                        <th className="px-6 py-4 w-10">
                            <input
                                type="checkbox"
                                checked={accounts.length > 0 && selectedIds.length === accounts.length}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                            />
                        </th>
                        <th className="px-6 py-4">Account</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4">Proxy</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                    {accounts.map((acc) => (
                        <tr key={acc.id} className={`hover:bg-slate-800/30 transition-colors ${selectedIds.includes(acc.id) ? 'bg-indigo-500/5' : ''} ${acc.status === 'CHALLENGE' ? 'bg-rose-500/3' : ''}`}>
                            <td className="px-6 py-4">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(acc.id)}
                                    onChange={() => toggleSelectOne(acc.id)}
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                                />
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-800 flex-shrink-0 border border-slate-700 overflow-hidden">
                                        {acc.profile_pic_url ? (
                                            <img src={acc.profile_pic_url} alt={acc.username} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                                                {acc.username?.substring(0, 2).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-200">@{acc.username}</div>
                                        <div className="text-xs text-slate-500">{acc.full_name || "Bot"}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <StatusCell acc={acc} onRefresh={onRefresh} />
                            </td>
                            <td className="px-6 py-4">
                                <button
                                    onClick={async () => {
                                        const newType = acc.account_type === 'SCRAPER' ? 'DM' : 'SCRAPER';
                                        await supabase.from("accounts").update({ account_type: newType }).eq("id", acc.id);
                                        onRefresh?.();
                                    }}
                                    className={`px-2 py-1 rounded text-[10px] uppercase font-bold transition-all ${
                                        acc.account_type === 'SCRAPER' 
                                        ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20' 
                                        : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20'
                                    }`}
                                >
                                    {acc.account_type || 'DM'}
                                </button>
                            </td>
                            <td className="px-6 py-4">
                                <div className="text-xs text-slate-400 font-mono truncate max-w-[200px]">
                                    {acc.proxy ? acc.proxy : (
                                        <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 italic">
                                            No proxy
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button
                                    onClick={async () => {
                                        const { error } = await supabase.from("accounts").delete().eq("id", acc.id);
                                        if (error) alert("Error: " + error.message);
                                        else onDelete?.(acc.id);
                                    }}
                                    className="p-2 hover:bg-rose-500/10 rounded-lg transition-colors text-slate-400 hover:text-rose-500"
                                    title="Delete Account"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {accounts.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                No accounts found in the base. Bring your fleet online to start DMs.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function StatusCell({ acc, onRefresh }: { acc: any; onRefresh?: () => void }) {
    const session = acc.warmup_day || 0;
    const day = Math.ceil(session / 3) || 0;           // convert sessions → real calendar days
    const progress = Math.min((session / WARMUP_SESSIONS) * 100, 100);

    if (acc.status === "HEALTHY") {
        return (
            <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-500">Healthy</span>
            </div>
        );
    }

    if (acc.status === "WARMING_UP") {
        return (
            <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-500">Warming Up</span>
                    <span className="text-[10px] text-slate-500">Day {day}/{WARMUP_DAYS}</span>
                    <button
                        onClick={async () => {
                            await supabase.from("accounts").update({ status: "HEALTHY", warmup_day: 7 }).eq("id", acc.id);
                            onRefresh?.();
                        }}
                        className="ml-auto text-[9px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-1.5 py-0.5 rounded transition-all"
                        title="Promover pra HEALTHY agora"
                    >
                        → HEALTHY
                    </button>
                </div>
                <div className="w-32 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                        className="h-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        );
    }

    if (acc.status === "CHALLENGE") {
        return <ChallengeCell acc={acc} onRefresh={onRefresh} />;
    }

    return (
        <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-500" />
            <span className="text-xs text-slate-500">{acc.status}</span>
        </div>
    );
}

function ChallengeCell({ acc, onRefresh }: { acc: any; onRefresh?: () => void }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    async function handleReactivate() {
        setLoading(true);
        await supabase.from("accounts").update({ status: "WARMING_UP", warmup_day: 0 }).eq("id", acc.id);
        // Trigger immediate login test — don't wait for next maintenance cycle
        fetch("/api/engine/test-bot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: acc.username })
        }).catch(() => {});
        setLoading(false);
        onRefresh?.();
    }

    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-rose-500">Challenge</span>
                {acc.challenge_type === "TOTP" && (
                    <span className="text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                        2FA · auto
                    </span>
                )}
                {acc.challenge_type === "SMS" && (
                    <span className="text-[9px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-full">
                        SMS · manual
                    </span>
                )}
                <button
                    onClick={() => setOpen(v => !v)}
                    className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
                    title="Ver credenciais"
                >
                    {open ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                    onClick={handleReactivate}
                    disabled={loading}
                    className="text-amber-500 hover:text-amber-300 disabled:opacity-40 transition-colors"
                    title="Reativar após verificação"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            {open && (
                <div className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 space-y-1 text-[10px] font-mono">
                    <div className="flex gap-2 items-center">
                        <span className="text-slate-600 w-7">pass</span>
                        <span className="text-slate-200 select-all truncate">{acc.password}</span>
                    </div>
                    {acc.two_factor_seed && (
                        <div className="flex gap-2 items-center border-t border-slate-800 pt-1">
                            <span className="text-slate-600 w-7">2FA</span>
                            <span className="text-amber-400 select-all truncate">{acc.two_factor_seed}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

