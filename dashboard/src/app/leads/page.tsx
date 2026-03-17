"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import LeadTable from "@/components/LeadTable";
import { Search, List, Users, Plus, Trash2, Clock, CheckCircle, XCircle, Activity, AlertCircle } from "lucide-react";

type Tab = "scraper" | "lists" | "database";
type ScrapeMode = "username" | "location";
type StatusFilter = "ALL" | "QUALIFIED" | "SENT" | "FOLLOWED_UP" | "REPLIED" | "REJECTED";

export default function LeadsPage() {
    const [activeTab, setActiveTab] = useState<Tab>("scraper");

    // Shared
    const [lists, setLists] = useState<any[]>([]);

    // Scraper
    const [scrapeMode, setScrapeMode] = useState<ScrapeMode>("username");
    const [tasks, setTasks] = useState<any[]>([]);
    const [targetUsername, setTargetUsername] = useState("");
    const [amount, setAmount] = useState(100);
    const [targetListId, setTargetListId] = useState("");
    const [scraperLoading, setScraperLoading] = useState(false);
    const [expandedError, setExpandedError] = useState<string | null>(null);

    // Location scraper
    const [locationCity, setLocationCity] = useState("");
    const [radiusKm, setRadiusKm] = useState(40);
    const [recencyDays, setRecencyDays] = useState(30);

    // Lists
    const [newListName, setNewListName] = useState("");
    const [listsLoading, setListsLoading] = useState(false);

    // Database
    const [leads, setLeads] = useState<any[]>([]);
    const [selectedListId, setSelectedListId] = useState("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
    const [leadsLoading, setLeadsLoading] = useState(true);

    useEffect(() => {
        fetchLists();
        fetchTasks();
        fetchLeads();

        // Realtime: scrape_tasks progress (replaces polling)
        const scraperChannel = supabase
            .channel("scrape_tasks_realtime")
            .on("postgres_changes", { event: "*", schema: "public", table: "scrape_tasks" },
                () => fetchTasks()
            )
            .subscribe();

        // Realtime: leads (INSERT + UPDATE for status changes)
        const leadsChannel = supabase
            .channel("leads_realtime")
            .on("postgres_changes", { event: "*", schema: "public", table: "leads" },
                () => fetchLeads()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(scraperChannel);
            supabase.removeChannel(leadsChannel);
        };
    }, []);

    useEffect(() => {
        fetchLeads();
    }, [selectedListId]);

    async function fetchLists() {
        const { data } = await supabase.from("lead_lists").select("*, leads(count)").order("created_at", { ascending: false });
        if (data) setLists(data);
    }

    async function fetchTasks() {
        const { data } = await supabase.from("scrape_tasks").select("*, lead_lists(name)").order("created_at", { ascending: false });
        if (data) setTasks(data);
    }

    async function fetchLeads() {
        setLeadsLoading(true);
        let query = supabase.from("leads").select("*, lead_lists(name)").order("created_at", { ascending: false }).limit(200);
        if (selectedListId !== "all") query = query.eq("list_id", selectedListId);
        const { data } = await query;
        if (data) setLeads(data);
        setLeadsLoading(false);
    }

    async function handleQueueScrape() {
        if (!targetListId) return;
        if (scrapeMode === "username" && !targetUsername) return;
        if (scrapeMode === "location" && !locationCity) return;

        setScraperLoading(true);

        const payload = scrapeMode === "username"
            ? { target_username: targetUsername.replace("@", ""), amount, list_id: targetListId, status: "PENDING", task_type: "USERNAME" }
            : { target_username: locationCity, list_id: targetListId, status: "PENDING", task_type: "LOCATION", radius_km: radiusKm, recency_days: recencyDays, amount: 0 };

        const { error } = await supabase.from("scrape_tasks").insert(payload);
        if (!error) {
            setTargetUsername("");
            setLocationCity("");
            fetch("/api/engine", { method: "POST", body: JSON.stringify({ action: "start" }) }).catch(() => {});
        }
        setScraperLoading(false);
    }

    async function handleCreateList() {
        if (!newListName) return;
        setListsLoading(true);
        const { error } = await supabase.from("lead_lists").insert({ name: newListName });
        if (!error) { setNewListName(""); fetchLists(); }
        setListsLoading(false);
    }

    async function handleDeleteList(id: string) {
        await supabase.from("lead_lists").delete().eq("id", id);
        fetchLists();
    }

    async function handleDeleteListWithLeads() {
        if (!confirm("Delete this list and ALL its leads? This cannot be undone.")) return;
        await supabase.from("leads").delete().eq("list_id", selectedListId);
        await supabase.from("lead_lists").delete().eq("id", selectedListId);
        setSelectedListId("all");
        fetchLists();
        fetchLeads();
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "PENDING": return <Clock className="w-4 h-4 text-amber-500" />;
            case "RUNNING": return <Activity className="w-4 h-4 text-indigo-500 animate-pulse" />;
            case "COMPLETED": return <CheckCircle className="w-4 h-4 text-emerald-500" />;
            case "FAILED": return <XCircle className="w-4 h-4 text-rose-500" />;
            default: return null;
        }
    };

    // Pipeline stats
    const pipelineStats = {
        queued:      leads.filter(l => ["PENDING", "QUALIFIED"].includes(l.status)).length,
        sent:        leads.filter(l => l.status === "SENT").length,
        followedUp:  leads.filter(l => l.status === "FOLLOWED_UP").length,
        replied:     leads.filter(l => l.status === "REPLIED").length,
        rejected:    leads.filter(l => l.status === "REJECTED").length,
    };

    const filteredLeads = leads.filter(l => {
        if (statusFilter === "ALL") return true;
        if (statusFilter === "QUALIFIED") return ["PENDING", "QUALIFIED"].includes(l.status);
        return l.status === statusFilter;
    });

    const tabs: { id: Tab; label: string; icon: typeof Search }[] = [
        { id: "scraper", label: "Scraper", icon: Search },
        { id: "lists", label: "Lists", icon: List },
        { id: "database", label: "Database", icon: Users },
    ];

    const pipelineCards: { label: string; value: number; filter: StatusFilter; color: string; bg: string; activeBg: string }[] = [
        { label: "Replied 🔥",  value: pipelineStats.replied,    filter: "REPLIED",     color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20",  activeBg: "bg-emerald-500/20 border-emerald-400/60" },
        { label: "Step 2 Sent", value: pipelineStats.followedUp, filter: "FOLLOWED_UP", color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/20",   activeBg: "bg-purple-500/20 border-purple-400/60" },
        { label: "Step 1 Sent", value: pipelineStats.sent,       filter: "SENT",        color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20",       activeBg: "bg-blue-500/20 border-blue-400/60" },
        { label: "Ready",       value: pipelineStats.queued,     filter: "QUALIFIED",   color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20",   activeBg: "bg-indigo-500/20 border-indigo-400/60" },
        { label: "Filtered",    value: pipelineStats.rejected,   filter: "REJECTED",    color: "text-slate-500",  bg: "bg-slate-800 border-slate-700",           activeBg: "bg-slate-700 border-slate-500" },
    ];

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <header>
                    <h1 className="text-4xl font-extrabold tracking-tight">Leads</h1>
                    <p className="text-slate-400 mt-1">Scrape, organize, and track your prospect pipeline</p>
                </header>

                {/* Tab Bar */}
                <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                                activeTab === tab.id
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── SCRAPER TAB ── */}
                {activeTab === "scraper" && (
                    <div className="space-y-6">
                        {/* Form */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
                            {/* Mode Toggle */}
                            <div className="flex gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1 w-fit">
                                <button
                                    onClick={() => setScrapeMode("username")}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${scrapeMode === "username" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                                >
                                    <Users className="w-3.5 h-3.5" />
                                    By Account
                                </button>
                                <button
                                    onClick={() => setScrapeMode("location")}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${scrapeMode === "location" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                                >
                                    <Search className="w-3.5 h-3.5" />
                                    By Location
                                </button>
                            </div>

                            {/* By Account Fields */}
                            {scrapeMode === "username" && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500 uppercase">Target Account</label>
                                        <input
                                            value={targetUsername}
                                            onChange={(e) => setTargetUsername(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && handleQueueScrape()}
                                            placeholder="@neverlandcoffeebar"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500 uppercase">Amount</label>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(Number(e.target.value))}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500 uppercase">Target List</label>
                                        <select
                                            value={targetListId}
                                            onChange={(e) => setTargetListId(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                                        >
                                            <option value="">Select a List</option>
                                            {lists.map(list => (
                                                <option key={list.id} value={list.id}>{list.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        onClick={handleQueueScrape}
                                        disabled={scraperLoading || !targetUsername || !targetListId}
                                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 h-[46px] rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                                    >
                                        <Plus className="w-5 h-5" />
                                        Start Scraping
                                    </button>
                                </div>
                            )}

                            {/* By Location Fields */}
                            {scrapeMode === "location" && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                        <div className="space-y-2 lg:col-span-1">
                                            <label className="text-xs font-semibold text-slate-500 uppercase">City / Area</label>
                                            <input
                                                value={locationCity}
                                                onChange={(e) => setLocationCity(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && handleQueueScrape()}
                                                placeholder="Miami Beach, FL"
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500 uppercase">Radius</label>
                                            <select
                                                value={radiusKm}
                                                onChange={(e) => setRadiusKm(Number(e.target.value))}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                                            >
                                                <option value={10}>10 km — Very local</option>
                                                <option value={25}>25 km — City area</option>
                                                <option value={40}>40 km — Metro region</option>
                                                <option value={70}>70 km — Wide net</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500 uppercase">Posted in the last</label>
                                            <select
                                                value={recencyDays}
                                                onChange={(e) => setRecencyDays(Number(e.target.value))}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                                            >
                                                <option value={7}>7 days</option>
                                                <option value={30}>30 days</option>
                                                <option value={90}>90 days</option>
                                                <option value={180}>6 months</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500 uppercase">Target List</label>
                                            <select
                                                value={targetListId}
                                                onChange={(e) => setTargetListId(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                                            >
                                                <option value="">Select a List</option>
                                                {lists.map(list => (
                                                    <option key={list.id} value={list.id}>{list.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-slate-500 italic">
                                            Scrapes public posts with location tags within {radiusKm}km of {locationCity || "the city"}, posted in the last {recencyDays} days.
                                        </p>
                                        <button
                                            onClick={handleQueueScrape}
                                            disabled={scraperLoading || !locationCity || !targetListId}
                                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 h-[46px] px-6 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                                        >
                                            <Plus className="w-5 h-5" />
                                            Start Scraping
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tasks Table */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                            <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3">
                                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Live Queue</span>
                            </div>
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-800/30 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                        <th className="px-6 py-4">Target</th>
                                        <th className="px-6 py-4">Progress</th>
                                        <th className="px-6 py-4">List</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {tasks.map((task) => {
                                        const isLocation = task.task_type === "LOCATION";
                                        const progress = isLocation
                                            ? (task.processed_count || 0)
                                            : Math.min(((task.processed_count || 0) / Math.max(task.amount, 1)) * 100, 100);
                                        const isFailed = task.status === "FAILED";
                                        return (
                                            <React.Fragment key={task.id}>
                                                <tr className={`hover:bg-slate-800/20 transition-colors ${isFailed ? "bg-rose-500/5" : ""}`}>
                                                    <td className="px-6 py-4 font-medium text-slate-200">
                                                        {isLocation ? (
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">GEO</span>
                                                                    <span>{task.target_username}</span>
                                                                </div>
                                                                <div className="text-xs text-slate-500 mt-0.5">{task.radius_km}km · last {task.recency_days}d</div>
                                                            </div>
                                                        ) : (
                                                            <span>@{task.target_username}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="flex justify-between text-xs text-slate-500">
                                                                {isLocation ? (
                                                                    <span>{task.processed_count || 0} leads found</span>
                                                                ) : (
                                                                    <>
                                                                        <span>{task.processed_count || 0} / {task.amount}</span>
                                                                        <span>{Math.round(progress)}%</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {!isLocation && (
                                                                <div className="w-40 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                                    <div
                                                                        className={`h-full transition-all duration-300 ${
                                                                            isFailed ? "bg-rose-500" :
                                                                            task.status === "RUNNING" ? "bg-indigo-500 animate-pulse" : "bg-emerald-500"
                                                                        }`}
                                                                        style={{ width: `${progress}%` }}
                                                                    />
                                                                </div>
                                                            )}
                                                            {isLocation && task.status === "RUNNING" && (
                                                                <div className="w-40 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                                    <div className="h-full bg-indigo-500 animate-pulse w-full" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs">{task.lead_lists?.name || "—"}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            {getStatusIcon(task.status)}
                                                            <span className={`text-sm font-medium ${
                                                                task.status === "RUNNING" ? "text-indigo-400" :
                                                                task.status === "COMPLETED" ? "text-emerald-400" :
                                                                task.status === "FAILED" ? "text-rose-400" : "text-slate-400"
                                                            }`}>{{ PENDING: "Pending", RUNNING: "Running", COMPLETED: "Completed", FAILED: "Failed" }[task.status as string] || task.status}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-500 text-sm">
                                                        <div className="flex items-center gap-2">
                                                            {new Date(task.created_at).toLocaleDateString()}
                                                            {isFailed && task.error_log && (
                                                                <button
                                                                    onClick={() => setExpandedError(expandedError === task.id ? null : task.id)}
                                                                    className="text-rose-400 hover:text-rose-300 transition-colors"
                                                                    title="View error"
                                                                >
                                                                    <AlertCircle className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <button
                                                            onClick={async () => {
                                                                await supabase.from("scrape_tasks").delete().eq("id", task.id);
                                                                setTasks(prev => prev.filter(t => t.id !== task.id));
                                                            }}
                                                            className="p-1.5 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                                            title="Delete task"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                                {isFailed && expandedError === task.id && task.error_log && (
                                                    <tr className="bg-rose-500/5">
                                                        <td colSpan={5} className="px-6 py-3">
                                                            <div className="flex items-start gap-2 text-xs text-rose-400 font-mono bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                                                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                                <span className="whitespace-pre-wrap">{task.error_log}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {tasks.length === 0 && (
                                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-600 italic">No scraping tasks queued yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── LISTS TAB ── */}
                {activeTab === "lists" && (
                    <div className="space-y-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex gap-4 items-end shadow-xl">
                            <div className="flex-1 space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase">New List Name</label>
                                <input
                                    value={newListName}
                                    onChange={(e) => setNewListName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
                                    placeholder="e.g., Miami Promoters, NYC Clubs..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <button
                                onClick={handleCreateList}
                                disabled={listsLoading || !newListName}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 h-[46px] px-8 rounded-lg font-bold flex items-center gap-2 transition-all"
                            >
                                <Plus className="w-5 h-5" />
                                Create List
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {lists.map((list) => (
                                <div key={list.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/50 transition-all shadow-lg">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <h3 className="text-xl font-bold text-slate-100">{list.name}</h3>
                                            <div className="flex items-center gap-2 text-slate-500 text-sm">
                                                <Users className="w-4 h-4" />
                                                <span>{(list.leads?.[0] as any)?.count || 0} leads</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteList(list.id)}
                                            className="p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="mt-6 flex justify-end">
                                        <button
                                            onClick={() => { setSelectedListId(list.id); setActiveTab("database"); }}
                                            className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                                        >
                                            View Leads →
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {lists.length === 0 && (
                                <div className="col-span-2 py-12 text-center text-slate-600 italic">No lists yet. Create one above.</div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── DATABASE TAB ── */}
                {activeTab === "database" && (
                    <div className="space-y-6">
                        {/* Pipeline Stats — click to filter, click again to reset */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {pipelineCards.map(card => {
                                const isActive = statusFilter === card.filter;
                                return (
                                    <button
                                        key={card.label}
                                        onClick={() => setStatusFilter(isActive ? "ALL" : card.filter)}
                                        className={`${isActive ? card.activeBg : card.bg} border rounded-xl p-4 flex flex-col gap-1 text-left transition-all hover:opacity-80 cursor-pointer`}
                                    >
                                        <div className={`${card.color} text-xs font-semibold`}>{card.label}</div>
                                        <div className={`text-2xl font-extrabold ${card.color}`}>{card.value}</div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Controls */}
                        <div className="flex flex-wrap items-center gap-3">
                            <select
                                value={selectedListId}
                                onChange={(e) => setSelectedListId(e.target.value)}
                                className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                            >
                                <option value="all">All Lists</option>
                                {lists.map(list => (
                                    <option key={list.id} value={list.id}>{list.name}</option>
                                ))}
                            </select>

                            {selectedListId !== "all" && (
                                <button
                                    onClick={handleDeleteListWithLeads}
                                    className="bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20 px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Delete List
                                </button>
                            )}

                            <span className="text-sm text-slate-500 ml-auto">
                                {filteredLeads.length} leads
                            </span>
                        </div>

                        {/* Table */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
                            {leadsLoading ? (
                                <div className="p-16 text-center text-slate-500">Loading leads...</div>
                            ) : (
                                <LeadTable leads={filteredLeads} />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
