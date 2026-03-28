import os
import time
from brain_reporter import BrainReporter
from dotenv import load_dotenv

load_dotenv()

class AILeadProcessor:
    def __init__(self):
        self.reporter = BrainReporter()
        
    def score_lead(self, bio, full_name, follower_count, username=""):
        """
        Scoring Logic — tolerant of missing data (UserShort objects from scraper
        don't carry bio/follower_count, so we treat absence as neutral, not rejection).

        Base: 50
        Bonuses:
          +10  has any bio (real person filled it out)
          +5   has a full_name
          +15  follower_count 100–5,000 (outreach sweet spot)
        Penalties:
          -30  follower_count 1–9 (bot / dead account — 0 is treated as missing data)
          -10  follower_count > 50,000 (influencer, won't engage)
          -15  no full_name AND no bio (zero identity signals)
          -10  username contains 5+ consecutive digits (auto-generated pattern)
        """
        import re
        score = 50  # Base score — neutral

        # ── Identity signals ──────────────────────────────────────────────────
        if bio:
            score += 10
        if full_name:
            score += 5
        if not bio and not full_name:
            score -= 15  # No identity at all — likely bot or abandoned account

        # ── Follower count ────────────────────────────────────────────────────
        if follower_count and follower_count > 0:
            if 1 <= follower_count <= 9:
                score -= 30  # Almost certainly a bot or dead account
            elif 100 <= follower_count <= 5000:
                score += 15  # Sweet spot for outreach
            elif follower_count > 50000:
                score -= 10  # Influencer — unlikely to engage

        # ── Username pattern ──────────────────────────────────────────────────
        if username and re.search(r'\d{5,}', username):
            score -= 10  # Auto-generated username pattern

        return min(max(score, 0), 100)

    def process_pending_leads(self, batch_size=50):
        if not self.reporter.client: return
        
        print(f"🤖 AI Processor: Checking for pending leads...")
        res = self.reporter.client.table("leads").select("*").eq("status", "PENDING").limit(batch_size).execute()
        leads = res.data
        
        if not leads:
            print("No pending leads to process.")
            return

        for lead in leads:
            score = self.score_lead(
                bio=lead.get("bio") or "",
                full_name=lead.get("full_name") or "",
                follower_count=lead.get("follower_count") or 0,
                username=lead.get("username") or ""
            )
            
            status = "QUALIFIED" if score >= 40 else "REJECTED"
            
            print(f"🔍 Lead @{lead['username']} -> Score: {score} ({status})")
            
            try:
                self.reporter.client.table("leads").update({
                    "lead_quality_score": score,
                    "status": status
                }).eq("id", lead["id"]).execute()
            except Exception as e:
                print(f"Error updating lead {lead['username']}: {e}")

if __name__ == "__main__":
    processor = AILeadProcessor()
    while True:
        processor.process_pending_leads()
        print("Sleeping 30s before next AI batch...")
        time.sleep(30)
