"use client";

import { useState, useEffect } from "react";
import { X, Target, List, Mail, Play, User, Clock } from "lucide-react";
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
    const [followupTemplateId, setFollowupTemplateId] = useState("");
    const [followupDelayDays, setFollowupDelayDays] = useState(2);
    const [accountId, setAccountId] = useState("");
    const [lists, setLists] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

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
        setSubmitError(null);

        const payload: any = {
            name,
            list_id: listId,
            template_id: templateId,
            status: "ACTIVE",
        };
        if (accountId) payload.account_id = accountId;
        if (followupTemplateId) {
            payload.followup_template_id = followupTemplateId;
            payload.followup_delay_days = followupDelayDays;
        }

        const { data, error } = await supabase.from("campaigns").insert(payload).select();

        if (error) {
            setSubmitError(error.message);
        } else {
            setName(""); setListId(""); setTemplateId("");
            setFollowupTemplateId(""); setFollowupDelayDays(2); setAccountId("");
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

                <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                    {/* Name */}
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

                    {/* List + Template */}
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
                                <Mail className="w-3 h-3" /> Step 1 Template
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

                    {/* Follow-up */}
                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-purple-400" />
                            Follow-up (Step 2)
                            <span className="text-slate-600 font-normal normal-case tracking-normal">— optional</span>
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Follow-up Template</label>
                                <select
                                    value={followupTemplateId}
                                    onChange={(e) => setFollowupTemplateId(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-purple-500 outline-none appearance-none"
                                >
                                    <option value="">No follow-up</option>
                                    {templates.map(tpl => (
                                        <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Send after (days)</label>
                                <select
                                    value={followupDelayDays}
                                    onChange={(e) => setFollowupDelayDays(Number(e.target.value))}
                                    disabled={!followupTemplateId}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-purple-500 outline-none appearance-none disabled:opacity-40"
                                >
                                    <option value={1}>1 day</option>
                                    <option value={2}>2 days</option>
                                    <option value={3}>3 days</option>
                                    <option value={5}>5 days</option>
                                    <option value={7}>7 days</option>
                                </select>
                            </div>
                        </div>

                        {followupTemplateId && (
                            <p className="text-xs text-purple-400/80">
                                Leads que não responderem ao Step 1 receberão o Step 2 automaticamente após {followupDelayDays} dia{followupDelayDays > 1 ? "s" : ""}.
                            </p>
                        )}
                    </div>

                    {/* Bot Account */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <User className="w-3 h-3" /> Bot Account
                            <span className="text-slate-600 font-normal normal-case tracking-normal">(opcional)</span>
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

                    {submitError && (
                        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 text-rose-400 text-sm">
                            ⚠ {submitError}
                        </div>
                    )}

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
