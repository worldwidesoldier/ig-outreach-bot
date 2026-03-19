from brain_reporter import BrainReporter

reporter = BrainReporter()
supabase = reporter.client

assignments = [
    ("gujaraljazaya",  "http://14a131faac9ac:ff8cfe016f@185.186.63.17:12323"),
    ("oseffboysol",    "http://14a131faac9ac:ff8cfe016f@217.67.71.177:12323"),
    ("cuerdoandalucia","http://14a131faac9ac:ff8cfe016f@223.29.159.11:12323"),
    ("brialcindia",    "http://14a131faac9ac:ff8cfe016f@78.24.127.211:12323"),
]

for username, proxy in assignments:
    result = supabase.table("accounts")\
        .update({"proxy": proxy})\
        .eq("username", username)\
        .execute()
    print(f"✓ {username} → {proxy}")
