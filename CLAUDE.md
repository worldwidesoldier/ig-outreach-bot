# ATLAS IG — Sistema de Outreach Instagram

## O que é isso?
Sistema de automação de outreach no Instagram. Gerencia uma frota de contas bot que enviam DMs para leads de forma automática, segura e escalável. Desenvolvido para operações de marketing de eventos (Neverland Miami e similares).

---

## Servidor
- **VPS:** Ubuntu 24.04 em `5.78.193.8`
- **App directory:** `/opt/ig-outreach-bot`
- **Dashboard:** `/opt/ig-outreach-bot/dashboard` (Next.js 16.1.6 com Turbopack)
- **Services:** `ig-engine.service` (Python) + `ig-dashboard.service` (Next.js porta 3000)
- **Nginx:** porta 80 → localhost:3000
- **Timezone engine:** `TZ=America/New_York` no systemd service
- **Credenciais:** `/opt/ig-outreach-bot/.env` (Python) + `/opt/ig-outreach-bot/dashboard/.env.local` (Next.js)

## Login Dashboard
- **URL:** `http://5.78.193.8`
- **Email:** `admin@atlas.com`
- **Senha:** `Atlas2024!`

---

## Stack
- **Backend:** Python 3.12, instagrapi, Supabase Python SDK
- **Frontend:** Next.js 16, Tailwind CSS, TypeScript, Supabase JS
- **Database:** Supabase (Postgres)
- **Auth:** Supabase Auth com @supabase/ssr v0.9.0 (cookie-based)
- **Scheduler:** `schedule` lib — ciclos às 11:00, 17:00, 22:00 (Eastern)

---

## Arquivos principais

| Arquivo | Função |
|---------|--------|
| `scheduler.py` | Motor principal — orquestra todos os bots em paralelo |
| `sender.py` | Envia DMs (Step 1) e follow-ups (Step 2) |
| `warmup.py` | Protocolo de aquecimento de contas novas (7 dias) |
| `inbox_manager.py` | Sincroniza DMs recebidos com o Supabase |
| `brain_reporter.py` | Singleton de conexão Supabase — logs e status |
| `bot_utils.py` | Cliente Instagram (sessão, proxy, 2FA) |
| `scraper.py` | Raspa leads por localização ou hashtag |
| `cloner.py` | Espelha perfis e publica posts em massa |

---

## Tabelas Supabase

| Tabela | Descrição |
|--------|-----------|
| `accounts` | Contas bot (username, password, proxy, status, warmup_day) |
| `campaigns` | Campanhas (list_id, template_id, account_id, followup_template_id) |
| `lead_lists` | Listas de leads |
| `leads` | Leads individuais com status do funil |
| `message_templates` | Templates com suporte a spintax |
| `inbox_messages` | DMs recebidos sincronizados |
| `outreach_logs` | Log de cada DM enviado (account_id, lead_id, sequence_step) |
| `bot_activity_logs` | Log de atividade do engine |
| `scrape_tasks` | Fila de tarefas de scraping |
| `system_status` | Heartbeat e status do sistema |

---

## Status das contas (fluxo)

```
WARMING_UP → HEALTHY → (em operação)
                     ↘ AT_RISK → recovery warmup → WARMING_UP
                     ↘ CHALLENGE → requer atenção manual
                     ↘ BANNED → conta morta
```

## Status dos leads (funil)

```
QUALIFIED → SENDING → SENT → FOLLOWED_UP
                           ↘ REPLIED (parou tudo — lead respondeu)
```

---

## Como funciona o sistema completo

### 1. Adicionar contas (Accounts → Add Accounts)
Formato bulk — uma conta por linha:
```
username:senha:email@gmail.com:senhadoemail:http://user:pass@ip:porta
```
O sistema detecta automaticamente email, proxy e seed 2FA.

### 2. Warmup automático (7 dias)
- Dias 1-2: scroll passivo + stories
- Dias 3-4: 5-8 likes no feed (45-90s entre cada)
- Dias 5-6: 6-10 likes em hashtags do nicho
- Dia 7: promovida para HEALTHY automaticamente

### 3. Scraping de leads (Scraper)
- Contas dedicadas ao scraping (separadas das de DM)
- Busca por localização (geolocalização) ou hashtag
- Checkpoint a cada 50 pontos, batch save a cada 100 leads
- Leads entram na lista com status QUALIFIED

### 4. Templates com Spintax (Templates)
```
{Oi|Olá|E aí} {full_name}, {vi seu perfil|te encontrei aqui}...
```
Cada bot recebe uma variação diferente — evita detecção de padrão.

### 5. Campanhas compartilhadas (Campaigns)
- Deixar "Bot Account" em branco = todos os bots HEALTHY trabalham juntos
- O sistema divide os leads automaticamente com **claim atômico**:
  `UPDATE leads SET status='SENDING' WHERE id=? AND status='QUALIFIED'`
- Impossível dois bots enviarem para o mesmo lead

### 6. Follow-up da mesma conta
O follow-up (Step 2) é sempre enviado pelo **mesmo bot** que enviou o Step 1.
Filtro: `outreach_logs WHERE account_id = bot_id AND sequence_step = 1`

### 7. Sincronização de inbox
Roda **antes** de cada ciclo de follow-up — detecta respostas e marca leads como REPLIED antes de tentar enviar follow-up.

---

## Limites por conta (configurado em sender.py)

```python
DAILY_LIMIT  = 9    # DMs por dia (step 1 + step 2 juntos)
HOURLY_LIMIT = 3    # DMs por hora
MIN_SLEEP    = 240  # 4 min entre DMs
MAX_SLEEP    = 360  # 6 min entre DMs
```

**Progressão por idade da conta:**
| Idade | Limite seguro |
|-------|--------------|
| 0-30 dias | 9/dia |
| 30-90 dias | 15-20/dia |
| 90-180 dias | 20-25/dia |
| 6+ meses | 30-35/dia |

---

## Capacidade atual (50 bots, 9 DMs/dia)
```
50 × 9 = 450 DMs/dia
450 × 30 = 13.500 DMs/mês
```

---

## Plano de Expansão — 100.000 mensagens em 15 dias

### Meta
```
100.000 DMs ÷ 15 dias = 6.667 DMs/dia necessários
6.667 ÷ 9 DMs/bot = 741 bots necessários (com limite atual)
6.667 ÷ 20 DMs/bot = 333 bots (com contas de 30+ dias)
6.667 ÷ 35 DMs/bot = 191 bots (com contas de 6+ meses)
```

### Caminho mais rápido: contas aged (30+ dias) + aumento gradual de limite

**Fase 0 — Agora (semana 1-2)**
- 50 bots em warmup de 7 dias
- Scraping acumulando 100k leads na fila
- 2-5 contas de scraping rodando 24/7
- Meta: ter 100k leads QUALIFIED antes dos bots ficarem HEALTHY

**Fase 1 — Semana 2-4 (50 bots HEALTHY)**
- 50 × 9 = 450 DMs/dia
- Testar templates, medir taxa de resposta
- Criar mais 100 contas em warmup paralelo

**Fase 2 — Semana 4-8 (150 bots)**
- Contas da Fase 1 com 30+ dias → aumentar para 15/dia
- 50 novas × 9 + 100 aged × 15 = 450 + 1.500 = 1.950/dia
- Aumentar `MAX_CONCURRENT` de 10 → 30 em scheduler.py
- Upgrade servidor: 2GB → 4GB RAM

**Fase 3 — Mês 2-3 (300 bots)**
- 300 bots × 20/dia = 6.000 DMs/dia → **100k em ~17 dias**
- Aumentar `MAX_CONCURRENT` → 50
- Upgrade servidor: 4GB → 8GB RAM
- 300 proxies residenciais

**Fase 4 — Mês 4+ (200 bots aged)**
- Contas com 6+ meses → 35/dia
- 200 × 35 = 7.000 DMs/dia → **100k em 14 dias** com apenas 200 bots

### Ajustes técnicos necessários para escalar

1. **`scheduler.py` linha ~107:** `MAX_CONCURRENT = 10` → aumentar para 30-50
2. **`sender.py` linha ~32:** `DAILY_LIMIT = 9` → aumentar gradualmente por idade
3. **Servidor:** upgrade de RAM quando passar de 100 bots ativos
4. **Supabase:** plano Pro para volume de queries com 200+ bots

### Custo estimado (200 bots em plena operação)
```
200 proxies residenciais    → ~$400/mês
200 contas Instagram aged   → $400-800 (compra única)
Servidor 4GB                → ~$20/mês
Supabase Pro                → $25/mês
─────────────────────────────────────
Total                       → ~$845-1.245/mês
```

---

## Deploy

```bash
# Depois de mudanças no Python
sudo systemctl restart ig-engine

# Depois de mudanças no dashboard
cd /opt/ig-outreach-bot/dashboard
npm run build
sudo systemctl restart ig-dashboard

# Puxar atualizações do GitHub
cd /opt/ig-outreach-bot
git pull
```

## Gestão dos serviços

```bash
sudo systemctl status ig-engine ig-dashboard
sudo systemctl restart ig-engine
sudo systemctl restart ig-dashboard
tail -f /opt/ig-outreach-bot/engine_output.log
tail -f /opt/ig-outreach-bot/engine_error.log
journalctl -u ig-dashboard -n 50 --no-pager
```

---

## Alterações desta sessão (Março 2026)

### sender.py
- Campanhas compartilhadas: query com `.or_("account_id.eq.{bot_id},account_id.is.null")` — todos os bots HEALTHY trabalham em campanhas sem bot atribuído
- **Claim atômico** no Step 1: `UPDATE WHERE status='QUALIFIED'` — elimina race condition entre bots
- **Claim atômico** no Step 2: `UPDATE WHERE status='SENT'` — follow-up claimado atomicamente antes do envio
- Follow-up filtrado por `account_id = bot_id` no outreach_logs — garante que o mesmo bot faz Step 1 e Step 2
- Em caso de erro no follow-up: reverte status para `SENT` para outro bot tentar

### scheduler.py
- `MAX_CONCURRENT`: 8 → 10
- Stagger WARMING_UP: 20-40s → 5-15s (submissão de 50 bots: 75 min → 8 min)
- Stagger HEALTHY: 60-120s → 15-30s
- Inbox sync movido para ANTES do follow-up (detecta respostas antes de enviar Step 2)
- `check_fleet_health()` totalmente passiva — sem chamadas live à API do Instagram
- Handler de shutdown gracioso (SIGTERM/SIGINT)
- BrainReporter criado uma vez por bot, passado como parâmetro — elimina 200+ conexões Supabase simultâneas

### warmup.py
- `WARMUP_SESSIONS_TO_HEALTHY = 21` (3 sessões/dia × 7 dias)
- Pool de hashtags: 25 tags, `random.sample(k=5)` por sessão — diversidade entre bots
- Aceita parâmetro `reporter=` opcional

### brain_reporter.py
- `AT_RISK` agora reseta `warmup_day = 0` — recovery começa do zero, não do dia 21
- `send_alert()` — webhook para Discord/Slack em eventos CHALLENGE, BANNED, AT_RISK
- Alertas disparam automaticamente dentro de `report_status()`
- Usa `ALERT_WEBHOOK_URL` do `.env`

### inbox_manager.py
- `direct_threads(amount=10)` → `amount=50` (cobre frota de 50 bots)
- Guard para `other_user_id = None` — pula threads sem usuário identificado
- Aceita parâmetro `reporter=` opcional

### dashboard/src/app/login/actions.ts
- Removido `revalidatePath('/', 'layout')` — causava URL malformada `/operations,%20/operations`
- `redirect('/')` → `redirect('/operations')` — elimina double redirect do Next.js 16

### scraper.py
- Checkpoint a cada 50 grid points
- Batch save a cada 100 leads
- Guard para `task_id` antes de atualizar `scrape_tasks`

---

## Próximos passos

- [ ] Comprar 50 contas Instagram + 50 proxies residenciais
- [ ] Adicionar contas via Accounts → Add Accounts (formato `user:pass:email:emailpass:http://proxy`)
- [ ] Criar 2-3 contas dedicadas de scraping
- [ ] Raspar 100k leads no Scraper
- [ ] Criar templates com spintax variado
- [ ] Lançar primeira campanha sem bot atribuído (compartilhada)
- [ ] Após 30 dias: aumentar DAILY_LIMIT para 15 nas contas aged
- [ ] Após 60 dias: avaliar upgrade de servidor e MAX_CONCURRENT
