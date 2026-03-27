"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Shield,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  ChevronDown,
  ChevronRight,
  Activity,
  Users,
  Zap,
  Clock,
  Play,
  Square,
  MessageCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BotStat {
  id: string;
  username: string;
  status: string;
  proxy: string | null;
  warmup_day: number | null;
  dms_today: number;
  proxy_configured: boolean;
}

interface EngineStatus {
  id: string;
  last_heartbeat: string | null;
  cycle_start: string | null;
  cycle_end: string | null;
  bots_processed: number | null;
}

interface OpsData {
  engine: EngineStatus | null;
  bots: BotStat[];
  alerts: BotStat[];
  total_bots: number;
  healthy_count: number;
  warming_count: number;
  at_risk_count: number;
  challenge_count: number;
  total_dms_today: number;
  reply_rate: number;
  replied_count: number;
  contacted_count: number;
}

interface ProxyTestResult {
  username: string;
  proxy?: string;
  ok: boolean;
  latency?: number;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    HEALTHY:    "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    WARMING_UP: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    AT_RISK:    "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    CHALLENGE:  "bg-rose-500/15 text-rose-400 border border-rose-500/30",
    BANNED:     "bg-red-900/40 text-red-400 border border-red-500/30",
  };
  return map[status] ?? "bg-slate-700 text-slate-300 border border-slate-600";
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function cycleDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  return `${mins} min`;
}

function isEngineOnline(heartbeat: string | null | undefined): boolean {
  if (!heartbeat) return false;
  return Date.now() - new Date(heartbeat).getTime() < 5 * 60 * 1000;
}

// ─── Accordion ───────────────────────────────────────────────────────────────

function PlaybookItem({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-slate-900 hover:bg-slate-800/60 transition-colors"
      >
        <span className="font-semibold text-sm text-slate-200">{title}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 py-4 bg-slate-950 border-t border-slate-800 text-sm text-slate-400 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OperationsPage() {
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [proxyResults, setProxyResults] = useState<Record<string, ProxyTestResult>>({});
  const [proxyTesting, setProxyTesting] = useState(false);
  const [engineAction, setEngineAction] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/operations/status");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastUpdated(new Date().toLocaleTimeString("pt-BR"));
      }
    } catch {
      // silently fail on auto-refresh
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleEngineAction(action: "start" | "stop" | "restart") {
    setEngineAction(action);
    try {
      await fetch("/api/operations/engine-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      // Wait 3s then refresh status
      await new Promise(r => setTimeout(r, 3000));
      await fetchData();
    } catch {
      // ignore
    } finally {
      setEngineAction(null);
    }
  }

  async function handleProxyTest() {
    setProxyTesting(true);
    try {
      const res = await fetch("/api/operations/proxy-test", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        const map: Record<string, ProxyTestResult> = {};
        (json.results as ProxyTestResult[]).forEach((r) => {
          map[r.username] = r;
        });
        setProxyResults(map);
      }
    } finally {
      setProxyTesting(false);
    }
  }

  const DAILY_LIMIT = 9;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm uppercase tracking-widest">
              <Shield className="w-4 h-4" />
              Operations Center
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">War Room</h1>
            <p className="text-slate-400">Visao operacional em tempo real da frota</p>
          </div>

          <div className="flex flex-col items-end gap-3">
            {/* Engine status + controls */}
            <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${
              isEngineOnline(data?.engine?.last_heartbeat)
                ? "bg-emerald-500/10 border-emerald-500/20"
                : "bg-rose-500/10 border-rose-500/20"
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  isEngineOnline(data?.engine?.last_heartbeat) ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`} />
                <span className={`text-sm font-bold ${
                  isEngineOnline(data?.engine?.last_heartbeat) ? "text-emerald-400" : "text-rose-400"
                }`}>
                  ENGINE {isEngineOnline(data?.engine?.last_heartbeat) ? "ONLINE" : "OFFLINE"}
                </span>
              </div>

              <div className="flex items-center gap-1.5 border-l border-slate-700 pl-3">
                {/* Start */}
                <button
                  onClick={() => handleEngineAction("start")}
                  disabled={!!engineAction || isEngineOnline(data?.engine?.last_heartbeat)}
                  title="Iniciar engine"
                  className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {engineAction === "start" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                </button>
                {/* Restart */}
                <button
                  onClick={() => handleEngineAction("restart")}
                  disabled={!!engineAction}
                  title="Reiniciar engine"
                  className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {engineAction === "restart" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </button>
                {/* Stop */}
                <button
                  onClick={() => handleEngineAction("stop")}
                  disabled={!!engineAction || !isEngineOnline(data?.engine?.last_heartbeat)}
                  title="Parar engine"
                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {engineAction === "stop" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-current" />}
                </button>
              </div>
            </div>

            {/* Cycle info */}
            {data?.engine?.cycle_start && (
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Último ciclo: {fmtTime(data.engine.cycle_start)} → {fmtTime(data.engine.cycle_end)}
                </span>
                <span>{cycleDuration(data.engine.cycle_start, data.engine.cycle_end)}</span>
                {data.engine.bots_processed != null && <span>{data.engine.bots_processed} bots</span>}
              </div>
            )}

            <div className="flex items-center gap-3">
              {lastUpdated && <span className="text-xs text-slate-600">Atualizado: {lastUpdated}</span>}
              <button
                onClick={() => { setLoading(true); fetchData(); }}
                disabled={loading}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
            </div>
          </div>
        </header>

        {/* ── Summary Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Total */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-slate-400">
              <Users className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">Total Bots</span>
            </div>
            <p className="text-3xl font-extrabold text-slate-100">{data?.total_bots ?? "—"}</p>
          </div>

          {/* Healthy */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">Healthy</span>
            </div>
            <p className="text-3xl font-extrabold text-emerald-400">{data?.healthy_count ?? "—"}</p>
          </div>

          {/* Warming Up */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-blue-400">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">Warming Up</span>
            </div>
            <p className="text-3xl font-extrabold text-blue-400">{data?.warming_count ?? "—"}</p>
          </div>

          {/* At Risk + Challenge */}
          <div className={`bg-slate-900/50 border rounded-2xl p-5 space-y-2 ${
            (data?.at_risk_count ?? 0) + (data?.challenge_count ?? 0) > 0
              ? "border-rose-500/30 bg-rose-500/5"
              : "border-slate-800"
          }`}>
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">At Risk / Challenge</span>
              {(data?.at_risk_count ?? 0) + (data?.challenge_count ?? 0) > 0 && (
                <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                  !
                </span>
              )}
            </div>
            <p className="text-3xl font-extrabold text-rose-400">
              {data != null ? (data.at_risk_count + data.challenge_count) : "—"}
            </p>
          </div>

          {/* DMs Today */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400">
              <Zap className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">DMs Hoje</span>
            </div>
            <p className="text-3xl font-extrabold text-indigo-400">{data?.total_dms_today ?? "—"}</p>
          </div>

          {/* Reply Rate */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <MessageCircle className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">Reply Rate</span>
            </div>
            <p className="text-3xl font-extrabold text-emerald-400">
              {data != null ? `${data.reply_rate}%` : "—"}
            </p>
            <p className="text-[10px] text-slate-500">
              {data != null ? `${data.replied_count} / ${data.contacted_count} leads` : ""}
            </p>
          </div>
        </div>

        {/* ── Alerts Section ─────────────────────────────────────────────────── */}
        {data && data.alerts.length > 0 && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <h2 className="font-bold text-rose-300 text-sm uppercase tracking-wider">
                {data.alerts.length} bot(s) precisam de atencao imediata
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.alerts.map((bot) => (
                <div
                  key={bot.id}
                  className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-slate-200 text-sm">@{bot.username}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${statusBadge(bot.status)}`}>
                    {bot.status}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-rose-400/70 italic">
              Acao necessaria — acesse a aba Accounts para resolver os bots acima.
            </p>
          </div>
        )}

        {/* ── Bot Grid ───────────────────────────────────────────────────────── */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              <h2 className="font-bold text-slate-100 text-sm uppercase tracking-wider">Grade de Bots</h2>
            </div>
            <button
              onClick={handleProxyTest}
              disabled={proxyTesting}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
            >
              {proxyTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Globe className="w-4 h-4" />
              )}
              {proxyTesting ? "Testando Proxies..." : "Testar Todos os Proxies"}
            </button>
          </div>

          {loading && !data ? (
            <div className="p-12 flex items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Carregando dados...</span>
            </div>
          ) : data && data.bots.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm italic">
              Nenhum bot encontrado. Adicione contas em The Base.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <th className="px-5 py-3 text-left">Username</th>
                    <th className="px-5 py-3 text-left">Status</th>
                    <th className="px-5 py-3 text-left">DMs Hoje</th>
                    <th className="px-5 py-3 text-left">Warmup</th>
                    <th className="px-5 py-3 text-left">Proxy</th>
                    <th className="px-5 py-3 text-left">Teste de Proxy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(data?.bots ?? []).map((bot) => {
                    const proxyResult = proxyResults[bot.username];
                    const dmPct = Math.min((bot.dms_today / DAILY_LIMIT) * 100, 100);
                    return (
                      <tr key={bot.id} className="hover:bg-slate-800/20 transition-colors">
                        {/* Username */}
                        <td className="px-5 py-3 font-bold text-slate-200 whitespace-nowrap">
                          @{bot.username}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${statusBadge(bot.status)}`}>
                            {bot.status}
                          </span>
                        </td>

                        {/* DMs hoje */}
                        <td className="px-5 py-3">
                          <div className="space-y-1 min-w-[80px]">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-300 font-semibold">{bot.dms_today}</span>
                              <span className="text-slate-600">/ {DAILY_LIMIT}</span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden w-24">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  dmPct >= 100 ? "bg-rose-500" : dmPct >= 75 ? "bg-amber-500" : "bg-indigo-500"
                                }`}
                                style={{ width: `${dmPct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Warmup */}
                        <td className="px-5 py-3 text-xs text-slate-400">
                          {bot.status === "WARMING_UP" && bot.warmup_day != null
                            ? `Dia ${bot.warmup_day} / 21`
                            : "—"}
                        </td>

                        {/* Proxy configured */}
                        <td className="px-5 py-3">
                          {bot.proxy_configured ? (
                            <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Configurado
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-rose-400 text-xs font-semibold">
                              <XCircle className="w-3.5 h-3.5" />
                              SEM PROXY
                            </span>
                          )}
                        </td>

                        {/* Proxy test result */}
                        <td className="px-5 py-3 text-xs">
                          {!bot.proxy_configured ? (
                            <span className="flex items-center gap-1 text-rose-400 font-semibold">
                              <XCircle className="w-3.5 h-3.5" />
                              Sem proxy
                            </span>
                          ) : proxyTesting ? (
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Testando...
                            </span>
                          ) : proxyResult ? (
                            proxyResult.ok ? (
                              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                OK ({proxyResult.latency}ms)
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
                                <XCircle className="w-3.5 h-3.5" />
                                {proxyResult.error ?? "Erro"}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-600 italic">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Playbooks ──────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Playbooks Operacionais</h2>
          </div>
          <div className="space-y-2">
            <PlaybookItem title="Bot foi para CHALLENGE">
              O Instagram pediu verificacao manual. Abra a conta no app do Instagram, resolva o desafio (e-mail ou SMS),
              depois volte em Accounts e clique em Reset para HEALTHY. Se nao resolver em 24h, a conta pode estar comprometida.
            </PlaybookItem>

            <PlaybookItem title="Proxy caiu (vermelho no teste)">
              Troque o proxy da conta imediatamente em Accounts &rarr; Edit. Nunca deixe um bot enviar DMs sem proxy —
              ele vai usar o IP do servidor e o Instagram vai banir todas as contas nesse IP.
            </PlaybookItem>

            <PlaybookItem title="Ciclo demorou mais de 3 horas">
              Normal com 50+ bots. O proximo horario agendado (13h/18h/21h) sera pulado se o anterior ainda estiver
              rodando. Isso e esperado — nao interfira.
            </PlaybookItem>

            <PlaybookItem title="Bot enviou mais de 9 DMs/dia">
              Nunca altere manualmente DAILY_LIMIT sem entender o impacto. Contas novas (&lt; 30 dias) nao devem passar
              de 9/dia. Contas com 60+ dias podem chegar a 15, mas mude com cautela.
            </PlaybookItem>

            <PlaybookItem title="Como adicionar novas contas com seguranca">
              Use Accounts &rarr; Bulk Add com o formato:{" "}
              <code className="bg-slate-800 text-indigo-300 px-1 py-0.5 rounded text-[11px]">
                username:password:SEED_2FA:http://user:pass@host:porta
              </code>
              . Uma proxy por conta — nunca compartilhe. O sistema coloca em WARMING_UP automaticamente.
              Aguarde 7 dias antes de ativar em campanhas.
            </PlaybookItem>
          </div>
        </div>

      </div>
    </div>
  );
}
