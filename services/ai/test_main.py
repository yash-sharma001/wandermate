"""Smoke checks: `python test_main.py` (inside the image the embedding model is baked in; no database needed)."""
from datetime import datetime, timezone

from embeddings import describe, embed
from main import ItineraryRequest, assemble_plan, query_text

# --- assemble_plan: pure layout logic ---
req = ItineraryRequest(destination="Goa", days=2, interests=["beaches"])
hit = {"kind": "activity", "item_id": 7, "title": "Beach yoga", "place": "Palolem", "start_time": datetime(2030, 1, 1, 6, tzinfo=timezone.utc)}
plan = assemble_plan(req, [hit, {**hit, "item_id": 8, "kind": "package", "start_time": None}])
assert plan["matches"] == 2 and len(plan["days"]) == 2 and all(len(d["activities"]) == 3 for d in plan["days"])
assert plan["days"][0]["activities"][0]["ref_id"] == 7                      # best match goes first
assert plan["days"][0]["activities"][2]["kind"] == "free"                    # unmatched slots are honest free time
assert assemble_plan(req, [])["matches"] == 0
assert "beaches" in query_text(req)

# --- describe: text sent to the embedder ---
assert describe("package", {"title": "Goa escape", "category": "Beach", "destination": "Goa", "duration_days": 4}) == "Goa escape. Beach. Goa. 4 days"

# --- the model itself: right size, and related text is closer than unrelated text ---
v = embed("sunrise hike to a temple")
assert len(v) == 384


def dist(a, b):
    return 1 - sum(x * y for x, y in zip(embed(a), embed(b)))


assert dist("mountain trekking trip", "hike in the himalayas") < dist("mountain trekking trip", "pastry baking class")
print("ok")
