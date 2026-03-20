"use client";

import { useState, useEffect } from "react";
import { X, Target, List, Mail, Play, User } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface NewCampaignModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function NewCampaignModal({ isOpen, onClose, onSuccess }: NewCampaignModalProps) {
    const [name, setName] = useState("");
    const [listId, setListId] = useState("");
    const [templateId, setTemplateId] = useState("");
    const [accountId, setAccountId] = useState("");
    const [lists, setLists] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) fetchData();
    }, [isOpen]);

    async function fetchData() {
        const [listsRes, templatesRes, accountsRes] = await Promise.all([
            supabase.from("lead_lists").select("*").order("name"),
            supabase.from("message_templates").select("*").order("name"),
            supabase.from("accounts").select("id, username").eq("status", "HEALTHY").order("username"),
        ]);
        if (listsRes.data) setLists(listsRes.data);
        if (templatesRes.data) setTemplates(templatesRes.data);
        if (accountsRes.data) setAccounts(accountsRes.data);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name || !listId || !templateId) return;

        setLoading(true);
        const { error } = await supabase.from("campaigns").insert({
            name,
            list_id: listId,
            template_id: templateId,
            account_id: accountId || null,
            status: "ACTIVE"
        });

        if (!error) {
            setName(""); setListId(""); setTemplateId(""); setAccountId("");
            onSuccess();
            onClose();
            fetch("/api/engine", { method: "POST", body: JSON.stringify({ action: "start" }) }).catch(() => { });
        }
        setLoading(false);
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                            <Target className="w-5 h-5 text-indigo-500" />
                            Launch New Campaign
                        </h2>
                        <p className="text-sm text-slate-400">Target a specific list with a custom message.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Campaign Name</label>
                        <input
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Miami Beach Launch Q1"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <List className="w-3 h-3" /> Lead List
                            </label>
                            <select
                                required
                                value={listId}
                                onChange={(e) => setListId(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                            >
                                <option value="">Choose List...</option>
                                {lists.map(list => (
                                    <option key={list.id} value={list.id}>{list.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Mail className="w-3 h-3" /> Template
                            </label>
                            <select
                                required
                                value={templateId}
                                onChange={(e) => setTemplateId(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                            >
                                <option value="">Choose Template...</option>
                                {templates.map(tpl => (
                                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <User className="w-3 h-3" /> Bot Account
                            <span className="text-slate-600 font-normal normal-case tracking-normal">(optional — leave blank to use all HEALTHY bots)</span>
                        </label>
                        <select
                            value={accountId}
                            onChange={(e) => setAccountId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                        >
                            <option value="">All HEALTHY bots ({accounts.length} available)</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>@{acc.username}</option>
                            ))}
                        </select>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 text-lg"
                        >
                            {loading ? "Initializing..." : (
                                <>
                                    <Play className="w-5 h-5 fill-current" />
                                    Launch Outreach Campaign
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
