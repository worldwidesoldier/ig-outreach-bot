"use client";

import { useState } from "react";

export default function BotTable({ bots, selectedIds, onSelectChange }: {
    bots: any[],
    selectedIds: string[],
    onSelectChange: (ids: string[]) => void
}) {

    const toggleSelectAll = () => {
        if (selectedIds.length === bots.length) {
            onSelectChange([]);
        } else {
            onSelectChange(bots.map(b => b.id));
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
                <thead className="bg-slate-900/80 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                        <th className="px-6 py-3 w-10">
                            <input
                                type="checkbox"
                                checked={bots.length > 0 && selectedIds.length === bots.length}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                            />
                        </th>
                        <th className="px-6 py-3">Username</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Proxy</th>
                        <th className="px-6 py-3">Last Activity</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {bots.map((bot) => (
                        <tr key={bot.id} className={`hover:bg-slate-800/30 transition-colors ${selectedIds.includes(bot.id) ? 'bg-indigo-500/5' : ''}`}>
                            <td className="px-6 py-4">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(bot.id)}
                                    onChange={() => toggleSelectOne(bot.id)}
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                                />
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-200">@{bot.username}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(bot.status)}`}>
                                    {bot.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-400">{bot.proxy || "None"}</td>
                            <td className="px-6 py-4 text-sm text-slate-400">
                                {bot.last_login ? new Date(bot.last_login).toLocaleString() : "Never"}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">Manage</button>
                            </td>
                        </tr>
                    ))}
                    {bots.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                No bots in fleet yet. Add your first bot to start.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function getStatusColor(status: string) {
    switch (status) {
        case "HEALTHY": return "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
        case "WARMING_UP": return "bg-amber-500/10 text-amber-500 border border-amber-500/20";
        case "FLAGGED":
        case "CHALLENGE": return "bg-rose-500/10 text-rose-500 border border-rose-500/20";
        default: return "bg-slate-500/10 text-slate-500 border border-slate-500/20";
    }
}
