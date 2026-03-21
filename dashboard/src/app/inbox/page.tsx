"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Inbox, MessageCircle, Bot, Instagram } from "lucide-react";

interface Message {
    id: string;
    thread_id: string;
    message_id: string;
    sender_username: string;
    text: string;
    timestamp: string;
    account_id: string;
    bot_username?: string;
    lead_username?: string;
    lead_full_name?: string;
    lead_status?: string;
}

interface Thread {
    thread_id: string;
    bot_username: string;
    lead_username: string;
    lead_full_name: string;
    lead_status: string;
    last_message: string;
    last_timestamp: string;
    unread: boolean;
    messages: Message[];
}

export default function InboxPage() {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchInbox();

        const channel = supabase
            .channel("inbox_realtime")
            .on("postgres_changes", { event: "*", schema: "public", table: "inbox_messages" }, fetchInbox)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    async function fetchInbox() {
        const { data: messages } = await supabase
            .from("inbox_messages")
            .select("*, accounts(username)")
            .order("timestamp", { ascending: true });

        if (!messages) { setLoading(false); return; }

        // Collect all PKs to look up: both sender_username and other_user_pk
        const allPks = [...new Set([
            ...messages.map(m => m.sender_username),
            ...messages.map(m => m.other_user_pk).filter(Boolean),
        ])];

        const { data: leads } = await supabase
            .from("leads")
            .select("pk, username, full_name, status")
            .in("pk", allPks);

        const leadMap = Object.fromEntries((leads || []).map(l => [String(l.pk), l]));

        // Enrich messages — check both sender and other_user_pk for lead info
        const enriched: Message[] = messages.map(m => {
            const leadFromSender = leadMap[String(m.sender_username)];
            const leadFromOther = leadMap[String(m.other_user_pk)];
            const lead = leadFromSender || leadFromOther;
            return {
                ...m,
                bot_username: (m.accounts as any)?.username,
                lead_username: lead?.username,
                lead_full_name: lead?.full_name,
                lead_status: lead?.status,
                _other_user_pk: m.other_user_pk,
            };
        });

        // Group into threads
        const threadMap: Record<string, Thread> = {};
        for (const msg of enriched) {
            if (!threadMap[msg.thread_id]) {
                threadMap[msg.thread_id] = {
                    thread_id: msg.thread_id,
                    bot_username: msg.bot_username || "unknown",
                    lead_username: "",
                    lead_full_name: "",
                    lead_status: "",
                    last_message: msg.text,
                    last_timestamp: msg.timestamp,
                    unread: false,
                    messages: [],
                };
            }
            threadMap[msg.thread_id].messages.push(msg);
            threadMap[msg.thread_id].last_message = msg.text;
            threadMap[msg.thread_id].last_timestamp = msg.timestamp;
        }

        // Fix: scan ALL messages per thread to find the lead (not the bot)
        // Bot messages have sender_username = bot's IG user_id (not in leads table)
        // Lead messages have lead_username defined
        for (const thread of Object.values(threadMap)) {
            const leadMsg = thread.messages.find(m => m.lead_username);
            if (leadMsg) {
                thread.lead_username = leadMsg.lead_username!;
                thread.lead_full_name = leadMsg.lead_full_name || "";
                thread.lead_status = leadMsg.lead_status || "";
                thread.unread = leadMsg.lead_status === "REPLIED";
            } else {
                // Lead not in our DB (maybe they DM'd us first) — show PK as fallback
                const nonBotMsg = thread.messages.find(m => !m.bot_username || m.lead_username !== undefined);
                thread.lead_username = nonBotMsg?.sender_username || thread.thread_id.substring(0, 8);
            }
        }

        const sorted = Object.values(threadMap).sort(
            (a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime()
        );

        setThreads(sorted);

        if (selectedThread) {
            const updated = sorted.find(t => t.thread_id === selectedThread.thread_id);
            if (updated) setSelectedThread(updated);
        }

        setLoading(false);
    }

    const statusColor: Record<string, string> = {
        REPLIED:     "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
        SENT:        "bg-blue-500/15 text-blue-400 border-blue-500/20",
        FOLLOWED_UP: "bg-purple-500/15 text-purple-400 border-purple-500/20",
        QUALIFIED:   "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
    };

    const repliedCount = threads.filter(t => t.lead_status === "REPLIED").length;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
            <div className="max-w-7xl mx-auto w-full p-8 flex-1 flex flex-col gap-6">
                <header className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm uppercase tracking-widest">
                            <Inbox className="w-4 h-4" />
                            Command Center
                        </div>
                        <h1 className="text-4xl font-extrabold tracking-tight mt-1">Unified Inbox</h1>
                        <p className="text-slate-400 mt-1">All replies from all accounts in one place</p>
                    </div>
                    {repliedCount > 0 && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-3 text-center">
                            <p className="text-2xl font-extrabold text-emerald-400">{repliedCount}</p>
                            <p className="text-xs text-emerald-500 mt-0.5">Replied 🔥</p>
                        </div>
                    )}
                </header>

                <div className="flex-1 grid grid-cols-12 gap-4 min-h-[600px]">

                    {/* Thread List */}
                    <div className="col-span-4 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Conversations</span>
                            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{threads.length}</span>
                        </div>

                        {loading ? (
                            <div className="flex-1 flex items-center justify-center text-slate-600">Loading...</div>
                        ) : threads.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-600 p-6 text-center">
                                <MessageCircle className="w-10 h-10 opacity-30" />
                                <p className="text-sm">No replies yet. DMs will appear here when leads respond.</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
                                {threads.map(thread => (
                                    <button
                                        key={thread.thread_id}
                                        onClick={() => setSelectedThread(thread)}
                                        className={`w-full text-left px-4 py-3.5 hover:bg-slate-800/40 transition-colors ${selectedThread?.thread_id === thread.thread_id ? "bg-indigo-500/10 border-l-2 border-indigo-500" : ""}`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Avatar */}
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                                                {(thread.lead_username || "?").substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-semibold text-slate-200 text-sm truncate">
                                                        {thread.lead_full_name
                                                            ? `${thread.lead_full_name}`
                                                            : `@${thread.lead_username}`}
                                                    </span>
                                                    <span className="text-[10px] text-slate-600 flex-shrink-0">
                                                        {new Date(thread.last_timestamp).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                {thread.lead_full_name && (
                                                    <p className="text-[10px] text-indigo-400 truncate">@{thread.lead_username}</p>
                                                )}
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <Bot className="w-3 h-3 text-slate-600 flex-shrink-0" />
                                                    <span className="text-[10px] text-slate-600 truncate">via @{thread.bot_username}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 truncate mt-1">{thread.last_message}</p>
                                                {thread.lead_status && statusColor[thread.lead_status] && (
                                                    <span className={`inline-block mt-1.5 text-[9px] font-bold border px-1.5 py-0.5 rounded-full ${statusColor[thread.lead_status]}`}>
                                                        {thread.lead_status === "REPLIED" ? "🔥 REPLIED" : thread.lead_status}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Conversation View */}
                    <div className="col-span-8 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                        {!selectedThread ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-600">
                                <MessageCircle className="w-12 h-12 opacity-20" />
                                <p className="text-sm">Select a conversation</p>
                            </div>
                        ) : (
                            <>
                                {/* Header */}
                                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
                                            {(selectedThread.lead_username || "?").substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-100">
                                                {selectedThread.lead_full_name || `@${selectedThread.lead_username}`}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {selectedThread.lead_full_name && (
                                                    <span className="text-xs text-indigo-400">@{selectedThread.lead_username}</span>
                                                )}
                                                <a
                                                    href={`https://instagram.com/${selectedThread.lead_username}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-slate-500 hover:text-indigo-400 flex items-center gap-1 transition-colors"
                                                >
                                                    <Instagram className="w-3 h-3" />
                                                    View profile
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <Bot className="w-3.5 h-3.5" />
                                        via @{selectedThread.bot_username}
                                        {selectedThread.lead_status && statusColor[selectedThread.lead_status] && (
                                            <span className={`font-bold border px-2 py-0.5 rounded-full ${statusColor[selectedThread.lead_status]}`}>
                                                {selectedThread.lead_status === "REPLIED" ? "🔥 REPLIED" : selectedThread.lead_status}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                                    {selectedThread.messages.map(msg => {
                                        const fromLead = !!msg.lead_username;

                                        return (
                                            <div key={msg.message_id} className={`flex ${fromLead ? "justify-start" : "justify-end"}`}>
                                                <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${
                                                    fromLead
                                                        ? "bg-slate-800 text-slate-200 rounded-tl-sm"
                                                        : "bg-indigo-600 text-white rounded-tr-sm"
                                                }`}>
                                                    <p>{msg.text}</p>
                                                    <p className={`text-[10px] mt-1 ${fromLead ? "text-slate-500" : "text-indigo-300"}`}>
                                                        {fromLead ? `@${msg.lead_username}` : `@${msg.bot_username}`}
                                                        {" · "}
                                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Reply note */}
                                <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60">
                                    <p className="text-xs text-slate-600 text-center">
                                        Reply manually via the Instagram app on @{selectedThread.bot_username}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
