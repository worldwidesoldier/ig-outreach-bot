"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Users, Target, Activity, Database, Mail, Inbox, LogOut, Menu, X } from "lucide-react";
import { logout } from "@/app/login/actions";

export default function Sidebar() {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    // Hide sidebar on login page
    if (pathname === "/login") return null;

    const links = [
        { name: "Home", href: "/", icon: LayoutDashboard },
        { name: "The Base", href: "/accounts", icon: Database },
        { name: "Leads", href: "/leads", icon: Users },
        { name: "Inbox", href: "/inbox", icon: Inbox },
        { name: "Templates", href: "/templates", icon: Mail },
        { name: "Campaigns", href: "/campaigns", icon: Target },
        { name: "Live Activity", href: "/activity", icon: Activity },
    ];

    const NavLinks = ({ onClose }: { onClose?: () => void }) => (
        <>
            <nav className="flex-1 space-y-1">
                {links.map((link) => {
                    const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={onClose}
                            className={`flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-all group ${isActive
                                ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20"
                                : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                                }`}
                        >
                            <link.icon className={`w-5 h-5 transition-colors ${isActive ? "text-indigo-400" : "group-hover:text-indigo-400"}`} />
                            {link.name}
                        </Link>
                    );
                })}
            </nav>
            <div className="mt-auto pt-6 border-t border-slate-800">
                <button
                    onClick={() => logout()}
                    className="flex w-full items-center gap-3 px-3 py-3 rounded-xl font-medium text-slate-400 transition-all hover:text-red-400 hover:bg-red-500/10 group"
                >
                    <LogOut className="w-5 h-5 transition-colors group-hover:text-red-400" />
                    Sair do Sistema
                </button>
            </div>
        </>
    );

    return (
        <>
            {/* Desktop sidebar */}
            <aside className="hidden md:flex w-64 bg-slate-900 border-r border-slate-800 h-screen sticky top-0 p-6 flex-col gap-8">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-lg">A</div>
                    <span className="font-bold text-xl tracking-tight">ATLAS IG</span>
                </div>
                <NavLinks />
            </aside>

            {/* Mobile top bar */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center font-bold">A</div>
                    <span className="font-bold text-lg tracking-tight">ATLAS IG</span>
                </div>
                <button
                    onClick={() => setMobileOpen(true)}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                >
                    <Menu className="w-6 h-6" />
                </button>
            </div>

            {/* Mobile drawer overlay */}
            {mobileOpen && (
                <div className="md:hidden fixed inset-0 z-50 flex">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
                    <div className="relative w-72 bg-slate-900 h-full p-6 flex flex-col gap-6 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-lg">A</div>
                                <span className="font-bold text-xl tracking-tight">ATLAS IG</span>
                            </div>
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <NavLinks onClose={() => setMobileOpen(false)} />
                    </div>
                </div>
            )}
        </>
    );
}
