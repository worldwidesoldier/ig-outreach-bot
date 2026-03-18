import { login } from './actions'
import { Lock, Mail, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] p-6 font-sans text-white">
            <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/10 bg-white/5 p-10 backdrop-blur-xl shadow-2xl">
                <div className="flex flex-col items-center text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                        <ShieldCheck size={36} />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">ATLAS IG</h1>
                    <p className="mt-2 text-sm text-zinc-400">
                        Acesso Restrito ao Command Center
                    </p>
                </div>

                <form action={login} className="mt-8 space-y-6">
                    <div className="space-y-4">
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-indigo-400" />
                            <input
                                id="email"
                                name="email"
                                type="email"
                                required
                                className="block w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-10 pr-3 text-zinc-200 placeholder-zinc-500 ring-indigo-500/20 transition-all focus:border-indigo-500/50 focus:outline-none focus:ring-4"
                                placeholder="E-mail"
                            />
                        </div>
                        <div className="relative group">
                            <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-indigo-400" />
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="block w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-10 pr-3 text-zinc-200 placeholder-zinc-500 ring-indigo-500/20 transition-all focus:border-indigo-500/50 focus:outline-none focus:ring-4"
                                placeholder="Senha"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="group relative flex w-full justify-center rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-500 hover:shadow-[0_0_20px_rgba(79,70,229,0.4)] active:scale-[0.98]"
                    >
                        Entrar no Sistema
                    </button>
                </form>

                <div className="text-center text-xs text-zinc-600">
                    <p>ATLAS IG Outreach • v3.0 Elite</p>
                </div>
            </div>
        </div>
    )
}
