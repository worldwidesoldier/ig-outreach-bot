from brain_reporter import BrainReporter
import sys

try:
    r = BrainReporter()
    print("Attempting to insert test campaign...")
    result = r.client.table('campaigns').insert({'name': 'test_audit_bot', 'status': 'ACTIVE'}).execute()
    print(f"SUCCESS: {result.data}")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
