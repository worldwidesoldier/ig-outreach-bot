import os
import time
from brain_reporter import BrainReporter
from dotenv import load_dotenv

load_dotenv()

class AILeadProcessor:
    def __init__(self):
        self.reporter = BrainReporter()
        
    def score_lead(self, bio, full_name, follower_count):
        """
        Scoring Logic — tolerant of missing data (UserShort objects from scraper
        don't carry bio/follower_count, so we treat absence as neutral, not rejection).
        """
        score = 50  # Base score — neutral

        if bio:
            high_value_keywords = ["founder", "ceo", "owner", "empresa", "negócio", "invest", "marketing", "vendas", "events", "promoter", "nightlife", "venue", "bar", "club"]
            low_value_keywords = ["student", "estudante", "pessoal", "privado", "spam", "bot"]
            bio_lower = bio.lower()
            for kw in high_value_keywords:
                if kw in bio_lower: score += 10
            for kw in low_value_keywords:
                if kw in bio_lower: score -= 15

        # Only apply follower filter if data is available
        if follower_count and follower_count > 0:
            if 100 <= follower_count <= 5000:
                score += 15
            elif follower_count > 50000:
                score -= 10

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
                follower_count=lead.get("follower_count") or 0
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
