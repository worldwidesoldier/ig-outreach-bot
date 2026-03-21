"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AccountTable from "@/components/AccountTable";
import BulkAddModal from "@/components/BulkAddModal";
import BulkProxyModal from "@/components/BulkProxyModal";
import { Copy, Loader2, Plus, Database, Search, Globe, UserPlus, Trash2, FileX, Image } from "lucide-react";
import EngineControl from "@/components/EngineControl";

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isProxyModalOpen, setIsProxyModalOpen] = useState(false);
    const [mirrorLoading, setMirrorLoading] = useState(false);
    const [sourceUser, setSourceUser] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deletePostsLoading, setDeletePostsLoading] = useState(false);
    const [publishLoading, setPublishLoading] = useState(false);
    const [showPostForm, setShowPostForm] = useState(false);
    const [postImageUrl, setPostImageUrl] = useState("");
    const [postCaption, setPostCaption] = useState("");

    async function fetchAccounts() {
        setLoading(true);
        const { data, error } = await supabase
            .from("accounts")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) console.error("Error fetching accounts:", error);
        else setAccounts(data || []);
        setLoading(false);
    }

    useEffect(() => {
        fetchAccounts();

        const channel = supabase
            .channel("accounts_base_changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "accounts" },
                () => fetchAccounts()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    async function handleDeletePosts() {
        if (selectedIds.length === 0) return;
        if (!confirm(`Delete ALL posts from ${selectedIds.length} account(s)? This cannot be undone.`)) return;
        setDeletePostsLoading(true);
        const usernames = accounts.filter(a => selectedIds.includes(a.id)).map(a => a.username);
        const res = await fetch("/api/accounts/delete-posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames })
        });
        const data = await res.json();
        setNotification({ type: res.ok ? 'success' : 'error', message: data.message || data.error });
        setDeletePostsLoading(false);
    }

    async function handleDeleteSelected() {
        if (selectedIds.length === 0) return;
        if (!confirm(`Deletar ${selectedIds.length} conta(s) selecionada(s)? Essa ação não pode ser desfeita.`)) return;

        setDeleteLoading(true);
        const { error } = await supabase.from("accounts").delete().in("id", selectedIds);
        if (error) {
            setNotification({ type: 'error', message: "Erro ao deletar: " + error.message });
        } else {
            setAccounts(prev => prev.filter(a => !selectedIds.includes(a.id)));
            setSelectedIds([]);
            setNotification({ type: 'success', message: `${selectedIds.length} conta(s) deletada(s) com sucesso.` });
        }
        setDeleteLoading(false);
    }

    async function handlePublishPost() {
        if (!postImageUrl || selectedIds.length === 0) return;
        setPublishLoading(true);
        setNotification(null);
        try {
            const usernames = accounts.filter(a => selectedIds.includes(a.id)).map(a => a.username);
            const res = await fetch("/api/accounts/clone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "post", targetBotUsernames: usernames, imageUrl: postImageUrl, caption: postCaption })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setNotification({ type: "success", message: data.message });
            setPostImageUrl(""); setPostCaption(""); setShowPostForm(false); setSelectedIds([]);
        } catch (err: any) {
            setNotification({ type: "error", message: err.message });
        } finally {
            setPublishLoading(false);
        }
    }

    async function handleMirror() {
        if (!sourceUser || selectedIds.length === 0) return;

        setMirrorLoading(true);
        setNotification(null);

        try {
            const selectedAccounts = accounts.filter(b => selectedIds.includes(b.id));
            const usernames = selectedAccounts.map(b => b.username);

            const res = await fetch("/api/accounts/clone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceUsername: sourceUser,
                    targetBotUsernames: usernames
                })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to start mirroring");

            setNotification({ type: 'success', message: result.message });
            setSourceUser("");
            setSelectedIds([]);
        } catch (err: any) {
            setNotification({ type: 'error', message: err.message });
        } finally {
            setMirrorLoading(false);
        }
    }

    const filteredAccounts = accounts.filter(acc => {
        const matchesSearch = acc.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            acc.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "ALL" || acc.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statusCounts = {
        ALL:       accounts.length,
        HEALTHY:   accounts.filter(a => a.status === "HEALTHY").length,
        WARMING_UP: accounts.filter(a => a.status === "WARMING_UP").length,
        CHALLENGE: accounts.filter(a => a.status === "CHALLENGE").length,
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <header className="flex justify-between items-end">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm uppercase tracking-widest">
                            <Database className="w-4 h-4" />
                            Storage Center
                        </div>
                        <h1 className="text-4xl font-extrabold tracking-tight">The Base</h1>
                        <p className="text-slate-400">Centralized profile management & identity mirroring</p>
                    </div>

                    <div className="flex gap-3">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search usernames..."
                                className="bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-64 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                        >
                            <Plus className="w-4 h-4" />
                            Add Accounts
                        </button>
                    </div>
                </header>

                {notification && (
                    <div className={`p-4 rounded-xl border ${notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} animate-in fade-in slide-in-from-top-4`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            <span className="font-medium text-sm">{notification.message}</span>
                        </div>
                    </div>
                )}

                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden glassmorphism shadow-2xl">
                    <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40">
                        <div className="flex items-center gap-4 flex-wrap">
                            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                                <Database className="w-5 h-5 text-indigo-500" />
                                Fleet
                            </h2>
                            {/* Status filter pills */}
                            <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                                {([
                                    { id: "ALL",        label: "All",         color: "text-slate-300" },
                                    { id: "HEALTHY",    label: "Healthy",     color: "text-emerald-400" },
                                    { id: "WARMING_UP", label: "Warming Up",  color: "text-amber-400" },
                                    { id: "CHALLENGE",  label: "Challenge",   color: "text-rose-400" },
                                ] as const).map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setStatusFilter(f.id)}
                                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                                            statusFilter === f.id
                                                ? "bg-slate-700 text-slate-100"
                                                : `${f.color} opacity-50 hover:opacity-100`
                                        }`}
                                    >
                                        {f.label}
                                        <span className="bg-slate-600/60 px-1.5 py-0.5 rounded-full text-[10px]">
                                            {statusCounts[f.id]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {selectedIds.length > 0 && (
                            <div className="space-y-2 animate-in zoom-in-95">
                                <div className="flex items-center gap-3 bg-indigo-500/10 p-1.5 rounded-xl border border-indigo-500/20 backdrop-blur-md flex-wrap">
                                    <span className="text-xs font-bold text-indigo-400 px-3">{selectedIds.length} SELECTED</span>
                                    <div className="h-6 w-px bg-indigo-500/20" />
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {/* Mirror */}
                                        <input
                                            type="text"
                                            placeholder="@source_profile"
                                            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40 font-medium"
                                            value={sourceUser}
                                            onChange={(e) => setSourceUser(e.target.value)}
                                        />
                                        <button
                                            onClick={handleMirror}
                                            disabled={mirrorLoading || !sourceUser}
                                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
                                        >
                                            {mirrorLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                                            MIRROR
                                        </button>

                                        <div className="h-6 w-px bg-slate-700" />

                                        {/* Post Publisher toggle */}
                                        <button
                                            onClick={() => setShowPostForm(v => !v)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border ${showPostForm ? "bg-purple-600/20 border-purple-500/40 text-purple-300" : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"}`}
                                        >
                                            <Image className="w-3 h-3" />
                                            POST
                                        </button>

                                        <button
                                            onClick={() => setIsProxyModalOpen(true)}
                                            className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-700"
                                        >
                                            <Globe className="w-3 h-3 text-indigo-400" />
                                            PROXY
                                        </button>

                                        <div className="h-6 w-px bg-slate-700" />

                                        <button
                                            onClick={handleDeletePosts}
                                            disabled={deletePostsLoading}
                                            className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all text-amber-400 disabled:opacity-50"
                                        >
                                            {deletePostsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileX className="w-3 h-3" />}
                                            DEL POSTS
                                        </button>
                                        <button
                                            onClick={handleDeleteSelected}
                                            disabled={deleteLoading}
                                            className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all text-rose-400 disabled:opacity-50"
                                        >
                                            {deleteLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                            DELETE
                                        </button>
                                    </div>
                                </div>

                                {/* Post Publisher inline form */}
                                {showPostForm && (
                                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 space-y-3">
                                        <p className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                                            <Image className="w-3.5 h-3.5" />
                                            Publish Post to {selectedIds.length} bot(s) — 3-5 min stagger between each
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="md:col-span-1">
                                                <input
                                                    type="url"
                                                    placeholder="Image URL (https://...)"
                                                    value={postImageUrl}
                                                    onChange={(e) => setPostImageUrl(e.target.value)}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                />
                                            </div>
                                            <div className="md:col-span-1">
                                                <input
                                                    type="text"
                                                    placeholder="Caption (optional)"
                                                    value={postCaption}
                                                    onChange={(e) => setPostCaption(e.target.value)}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                />
                                            </div>
                                            <button
                                                onClick={handlePublishPost}
                                                disabled={publishLoading || !postImageUrl}
                                                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                                            >
                                                {publishLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
                                                Publish to {selectedIds.length} bot(s)
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <AccountTable
                        accounts={filteredAccounts}
                        selectedIds={selectedIds}
                        onSelectChange={setSelectedIds}
                        onDelete={(id) => setAccounts(prev => prev.filter(a => a.id !== id))}
                        onRefresh={fetchAccounts}
                    />
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Quick Actions</h3>
                    <div className="space-y-3">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="w-full bg-slate-950 hover:bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4 transition-all group border-l-4 border-l-indigo-500"
                        >
                            <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                                <UserPlus className="w-4 h-4 text-indigo-400" />
                            </div>
                            <div className="text-left">
                                <span className="block font-bold text-slate-200 text-sm">Bulk Import</span>
                                <span className="text-[10px] text-slate-500">Add accounts via string</span>
                            </div>
                        </button>

                        <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 leading-relaxed italic">
                                Tip: Mirror profiles to copy bio, profile picture, and recent posts across your army automatically.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <BulkAddModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={() => { }}
            />

            <BulkProxyModal
                isOpen={isProxyModalOpen}
                onClose={() => setIsProxyModalOpen(false)}
                selectedIds={selectedIds}
                onAssigned={() => setSelectedIds([])}
            />
        </div>
    );
}
