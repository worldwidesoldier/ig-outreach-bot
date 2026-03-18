# ATLAS IG — Master Context Document
> Última atualização: 2026-03-16
> Usar este documento para briefar qualquer AI nova que entrar no projeto.

---

## O QUE É ESSE PROJETO

**ATLAS IG** é um sistema de Instagram outreach automation B2B. O produto envia DMs personalizadas em escala para o público-alvo de clientes (promotores de eventos, negócios locais, agências), gerando um inbox lotado de respostas quentes que o cliente fecha manualmente.

---

## 👥 TIME & COLABORAÇÃO
- **Solon Quinha:** Proprietário e desenvolvedor principal.
- **Bernardo Belassis:** Desenvolvedor colaborador (foco em `belasis` e `fair-assist-admin`).

---

## 📂 REPOSITÓRIOS CHAVE (T1)
1. **[ATLAS IG (ig-outreach-bot)](https://github.com/worldwidesoldier/ig-outreach-bot)** - Nosso foco atual de desenvolvimento e refatoração.
2. **[Fair Assist Admin (bernardocds/Fair-Assit)](https://github.com/bernardocds/Fair-Assit)** - O repositório oficial para mudanças na Fair Assist (Colaboração com Bernardo).
3. **[Belasis (bernardocds/belasis)](https://github.com/bernardocds/belasis)** - Projeto compartilhado com Bernardo.


### Fluxo do produto
```
1. Bot segue o lead no Instagram
2. Bot envia DM personalizada (Step 1):
   "Hey {full_name}, just gave you a follow!
    [pitch do evento/produto do cliente]
    Lmk if you want the link!"
3. Se sem resposta em 48h → follow-up automático (Step 2):
   "Did you see this?"
4. Quando o lead responde → sistema detecta e notifica o cliente
5. Cliente fecha a venda no inbox próprio
```

### Nicho inicial
Primeiro cliente: eventos em Miami — Neverland Coffee Bar.
Campanha criada: "Miami - Neverland Coffee" (ACTIVE no Supabase)
Template criado: "Miami Step 1"
Lista: "miami"

---

## ARQUITETURA DO SISTEMA

### Stack
- **Backend:** Python 3.13, instagrapi, Supabase
- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, Supabase Realtime
- **Infra:** Engine Python rodando localmente, controlado via PID file
- **Proxy:** Proxy-Seller AT&T Dedicated Mobile — `http://dubcommedia:AnWUARfnzJ@209.145.57.39:43019`

### Localização
```
/Users/solonquinha/untitled folder 3/ig-outreach-bot/
├── scheduler.py       # Orquestrador principal
├── sender.py          # Envio de DMs (Step 1 + Step 2)
├── scraper.py         # Scraping de followers
├── warmup.py          # Protocolo de warmup
├── bot_utils.py       # Client factory (login, proxy, sessão)
├── brain_reporter.py  # Interface com Supabase
├── ai_processor.py    # Score de leads (heurístico)
├── inbox_manager.py   # Lê inbox dos bots, detecta REPLIED
├── cloner.py          # Espelha perfil de uma conta para os bots
├── sessions/          # Sessões salvas por bot (JSON)
├── engine_error.log   # Log de erros do engine
└── dashboard/         # Next.js app (porta 3000)
```

### Banco de Dados — Supabase
- `accounts` — contas bot
- `leads` — leads scrapeados
- `lead_lists` — listas nomeadas
- `campaigns` — campanhas
- `message_templates` — templates com {full_name} {username}
- `scrape_tasks` — fila de scraping
- `outreach_logs` — log de DMs enviados (tem created_at ✅)
- `bot_activity_logs` — log de atividade
- `inbox_messages` — mensagens recebidas

---

## STATUS ATUAL DO SISTEMA (2026-03-16)

### ✅ FUNCIONANDO
- Proxy AT&T autenticada e conectando Instagram (200 OK)
- Scraper funcionando — provou com @neverlandcoffeebar (100 leads) e @miamibeach (100 leads)
- Dashboard consolidado — 6 páginas limpas com Realtime
- Leads entram no banco como PENDING → AI scorer → QUALIFIED (score ≥ 40)
- `bot_utils.py` reutiliza sessão sem re-login (fix crítico implementado)
- `scheduler.py` não marca mais bots como CHALLENGE por erros de banco
- `sender.py` reutiliza client já autenticado (não faz double-login)
- `outreach_logs.created_at` coluna existe no Supabase ✅

### ⚠️ STATUS DOS BOTS (20 total)
- **HEALTHY:** `byte.5yw506c2cool242854` (único funcionando agora)
- **CHALLENGE:** `surge.5iu`, `wave.i7m`, `bolt.ra0` e outros — precisam resolução manual no app Instagram
- **WARMING_UP:** ~15 bots com sessões válidas (warmup_day 2-4)

### ❌ AINDA NÃO TESTADO
- Envio real de DM (Step 1) — PRÓXIMO PASSO
- Follow-up automático (Step 2) — implementado mas não testado
- Detecção de reply (InboxManager) — implementado mas não testado

---

## BUGS CORRIGIDOS NESSA SESSÃO

1. **Double-login com 2FA** — `sender.py` criava novo client sem 2FA → bots iam CHALLENGE
   - Fix: `run_campaign_step(client, username)` e `run_followup_step(client, username)` agora recebem o client já autenticado do scheduler

2. **Scheduler marcava CHALLENGE por qualquer erro** — erro de banco destruía bots HEALTHY
   - Fix: só marca CHALLENGE para erros reais do Instagram (ChallengeRequired, TwoFactorRequired, LoginRequired)

3. **Sessão expirada + re-login = login_required** — bot tentava fazer login completo com sessão inválida
   - Fix: `bot_utils.py` agora testa a sessão com `get_timeline_feed()` primeiro; só faz fresh login se necessário

4. **`outreach_logs.created_at` não existia** — engine travava ao verificar limite diário de DMs
   - Fix: Antigravity adicionou a coluna no Supabase

5. **AI scorer rejeitava todos os leads** — `if not bio: return 20` → score 20 < threshold 60 → REJECTED
   - Fix: leads sem bio recebem score 50 (neutro); threshold baixado para 40

---

## PRÓXIMOS PASSOS (ORDEM EXATA)

### AGORA — Testar DM
1. Confirmar que `byte.5yw` está HEALTHY no Supabase
2. Confirmar que existem leads QUALIFIED na lista "miami"
3. Forçar um ciclo de manutenção:
   ```bash
   cd "/Users/solonquinha/untitled folder 3/ig-outreach-bot"
   python3 -c "
   from scheduler import daily_maintenance
   daily_maintenance()
   "
   ```
4. Verificar `engine_error.log` e `/leads` → Database → filtro "Step 1"
5. Se DM sair → **MVP validado** 🎉

### DEPOIS — Escalar
6. Resolver challenges dos outros bots (abrir app Instagram e completar verificação)
7. Deixar 18 bots fazerem warmup natural (7 dias)
8. Com 20 bots HEALTHY → 400 DMs/dia

### MELHORIA TÉCNICA PENDENTE
- Scraper: mudar `user_followers(amount=800)` para paginação incremental → progresso real no dashboard
- Atualmente: fica em 0% até terminar tudo, depois pula para 100%

---

## COMANDOS ÚTEIS

```bash
# Instalar dependências
cd "/Users/solonquinha/untitled folder 3/ig-outreach-bot"
pip install -r requirements.txt

# Rodar engine
python3 scheduler.py

# Testar scraper isolado
python3 -c "from scraper import process_pending_tasks; process_pending_tasks()"

# Ver logs em tempo real
tail -f engine_error.log

# Dashboard
cd dashboard && npm run dev

# Verificar status dos bots
python3 -c "
from brain_reporter import BrainReporter
from collections import Counter
r = BrainReporter()
bots = r.client.table('accounts').select('username,status').execute().data
counts = Counter(b['status'] for b in bots)
print(counts)
healthy = [b['username'] for b in bots if b['status']=='HEALTHY']
print('HEALTHY:', healthy)
"

# Resetar bots CHALLENGE → WARMING_UP e setar 1 como HEALTHY
python3 -c "
from brain_reporter import BrainReporter
r = BrainReporter()
r.client.table('accounts').update({'status':'WARMING_UP'}).eq('status','CHALLENGE').execute()
bot = r.client.table('accounts').select('id,username').eq('status','WARMING_UP').order('created_at').limit(1).execute().data[0]
r.client.table('accounts').update({'status':'HEALTHY','warmup_day':7}).eq('id',bot['id']).execute()
print('HEALTHY:', bot['username'])
"
```

---

## INFORMAÇÕES TÉCNICAS IMPORTANTES

### Proxy
```
http://dubcommedia:AnWUARfnzJ@209.145.57.39:43019
```
AT&T Dedicated Mobile — Trust Score máximo no Instagram.

### .env
```
NEXT_PUBLIC_SUPABASE_URL=https://szadggvlivdwxipuwwcy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_kfyCPXObH1wzjsBBmweT1w_GlqV1jGr
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
IG_PROXY=
```

### Formato de import de contas
```
username:password:2FA_SEED
```
Proxy atribuída separadamente via BulkProxyModal.

### Rate limits do Instagram (2025)
- Followers scrape: sem limite fixo, mas throttle por target se tentar muitas vezes seguidas
- DMs para não-seguidores: 20/dia/conta nova (conservador e seguro)
- Com 20 bots × 20 DMs = 400 DMs/dia

### Comportamento do scraper
- `user_followers(amount=N)` é blocante — busca tudo antes de retornar
- Progresso só aparece no final (jump de 0% → 100%)
- Rate limit por target some em 30-60 minutos
- Usar `byte.5yw506c2cool242854` como bot scraper (sessão válida)

---

## NOTAS DO DESENVOLVEDOR

- Engine roda localmente (não em servidor)
- Sessions salvas em `sessions/{username}.json`
- `bot_utils.py` reutiliza sessão via `get_timeline_feed()` test — NÃO faz re-login se sessão válida
- Scheduler: scraper a cada 5 min, maintenance às 10h/14h/19h + no startup
- CHALLENGE por erro de banco foi corrigido — só marca CHALLENGE para erros IG reais
- `sender.py` recebe `(client, bot_username)` — NÃO cria client próprio
- AI scorer: score ≥ 40 = QUALIFIED; leads sem bio = 50 (neutro)
