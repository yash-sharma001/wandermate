"""WanderMates AI service.

- POST /itinerary: called synchronously by the Node API (services/api/modules/ai). Retrieves the closest
  upcoming activities and trips from the pgvector table and lays them out over the requested days.
- POST /events/embed: Hasura event trigger (activities, travel_packages) keeping item_embeddings current.
"""
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel, Field

import embeddings as emb

SLOTS = ("Morning", "Afternoon", "Evening")
MAX_DIST = 0.5  # cosine distance cut-off. bge-small on this data: related text 0.3-0.5, unrelated 0.5-0.65
KIND_OF_TABLE = {"activities": "activity", "travel_packages": "package"}


def _backfill():
    try:
        with emb.connect() as conn:
            print(f"embedding backfill done: {emb.backfill(conn)} new/changed rows", flush=True)
    except Exception as e:  # DB not ready or table missing: events and the next start will catch up
        print(f"embedding backfill failed: {e}", flush=True)


@asynccontextmanager
async def lifespan(app):
    emb.model()  # load once at startup, not on the first user request
    threading.Thread(target=_backfill, daemon=True).start()
    yield


app = FastAPI(title="WanderMates AI", lifespan=lifespan)


class ItineraryRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=100)
    days: int = Field(ge=1, le=14)
    interests: list[str] = Field(default_factory=list, max_length=10)
    budget: str = "mid"


def query_text(req: ItineraryRequest) -> str:
    interests = f" Interests: {', '.join(req.interests)}." if req.interests else ""
    return f"{req.destination}.{interests}"  # budget isn't in the item text, so it would only add noise


def assemble_plan(req: ItineraryRequest, matches: list[dict]) -> dict:
    """Lay ranked matches over days x slots. Empty slots are honest 'free time', not invented places."""
    days = []
    for d in range(req.days):
        acts = []
        for i, slot in enumerate(SLOTS):
            n = d * len(SLOTS) + i
            if n < len(matches):
                m = matches[n]
                acts.append({
                    "time": slot, "kind": m["kind"], "ref_id": m["item_id"], "title": m["title"], "place": m["place"],
                    "when": m["start_time"].isoformat() if m.get("start_time") else None,
                })
            else:
                acts.append({"time": slot, "kind": "free", "ref_id": None, "title": "Free time to explore", "place": req.destination, "when": None})
        days.append({"day": d + 1, "activities": acts})
    # ponytail: retrieval only, no language model composing the days yet; `mode` tells the UI which it got
    return {"destination": req.destination, "budget": req.budget, "mode": "retrieval", "matches": len(matches), "days": days}


def build_itinerary(req: ItineraryRequest) -> dict:
    with emb.connect() as conn:
        matches = emb.search(conn, query_text(req), limit=req.days * len(SLOTS), max_dist=MAX_DIST)
    return assemble_plan(req, matches)


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai"}


@app.post("/itinerary")
def itinerary(req: ItineraryRequest):
    return build_itinerary(req)


@app.post("/events/embed")
def embed_event(payload: dict):
    """Hasura event trigger payload. Non-2xx makes Hasura retry (retry_conf in hasura/bootstrap.js)."""
    kind = KIND_OF_TABLE[payload["table"]["name"]]
    event = payload["event"]
    with emb.connect() as conn:
        if event["op"] == "DELETE":
            emb.delete(conn, kind, event["data"]["old"]["id"])
        else:
            emb.upsert(conn, kind, event["data"]["new"])
    return {"ok": True}
