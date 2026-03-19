"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import CampaignList from "@/components/CampaignList";
import NewCampaignModal from "@/components/NewCampaignModal";

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    async function fetchCampaigns() {
        const { data, error } = await supabase
            .from("campaigns")
            .select("*, lead_lists(name), message_templates!template_id(name)")
            .order("created_at", { ascending: false });
        console.log("[campaigns] data:", data, "error:", error);
        if (error) {
            setFetchError(error.message);
        } else {
            setFetchError(null);
            setCampaigns(data || []);
        }
    }

    useEffect(() => {
        fetchCampaigns();
    }, []);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <header className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold">Campaigns</h1>
                        <p className="text-slate-400">Target your audience and track results</p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-lg font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                    >
                        New Campaign
                    </button>
                </header>

                {fetchError && (
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400 text-sm font-mono">
                        ⚠ Supabase error: {fetchError}
                    </div>
                )}

                <CampaignList campaigns={campaigns} />

                <NewCampaignModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={fetchCampaigns}
                />
            </div>
        </div>
    );
}
