import json
import os

accounts_file = "/Users/solonquinha/.gemini/antigravity/brain/6748cd2e-f945-449e-a33f-cc30b98dcf03/.system_generated/steps/933/output.txt"
with open(accounts_file, 'r') as f:
    content = json.load(f)
    raw_result = content['result']
    json_start = raw_result.find('[')
    json_end = raw_result.rfind(']') + 1
    accounts = json.loads(raw_result[json_start:json_end])

sql = []

# 1. Lead Lists
lead_lists = [{"id":"a36ba5bb-5655-457d-bbd6-25c8875afc70","name":"miami","created_at":"2026-03-13 03:57:56.887908+00"}]
for l in lead_lists:
    sql.append(f"INSERT INTO public.lead_lists (id, name, created_at) VALUES ('{l['id']}', '{l['name']}', '{l['created_at']}');")

# 2. Campaigns
campaigns = [{"id":"d74fd723-fb4b-4cb0-927f-765f8eb303eb","name":"Initial Outreach Test","status":"ACTIVE","created_at":"2026-03-13 01:43:19.010685+00","list_id":None,"template_id":None}]
for c in campaigns:
    list_id = f"'{c['list_id']}'" if c['list_id'] else "NULL"
    template_id = f"'{c['template_id']}'" if c['template_id'] else "NULL"
    sql.append(f"INSERT INTO public.campaigns (id, name, status, created_at, list_id, template_id) VALUES ('{c['id']}', '{c['name']}', '{c['status']}', '{c['created_at']}', {list_id}, {template_id});")

# 3. Accounts
for acc in accounts:
    cols = []
    vals = []
    for k, v in acc.items():
        cols.append(k)
        if v is None:
            vals.append("NULL")
        elif isinstance(v, (dict, list)):
            json_val = json.dumps(v).replace("'", "''")
            vals.append(f"'{json_val}'::jsonb")
        else:
            escaped_v = str(v).replace("'", "''")
            vals.append(f"'{escaped_v}'")
    sql.append(f"INSERT INTO public.accounts ({', '.join(cols)}) VALUES ({', '.join(vals)});")

# 4. Scrape Tasks
scrape_tasks = [{"id":"bc0480e2-138d-4e2a-a94b-0564a1024471","target_username":"neverlandcoffeebar","amount":100,"list_id":"a36ba5bb-5655-457d-bbd6-25c8875afc70","status":"PENDING","error_log":None,"created_at":"2026-03-13 03:58:02.51084+00","processed_count":0,"last_run":None}]
for s in scrape_tasks:
    sql.append(f"INSERT INTO public.scrape_tasks (id, target_username, amount, list_id, status, error_log, created_at, processed_count, last_run) VALUES ('{s['id']}', '{s['target_username']}', {s['amount']}, '{s['list_id']}', '{s['status']}', NULL, '{s['created_at']}', {s['processed_count']}, NULL);")

output_path = "/Users/solonquinha/untitled folder 3/ig-outreach-bot/migrate_data.sql"
with open(output_path, "w") as f:
    f.write("\n".join(sql))
print(f"SQL generated at {output_path}")
