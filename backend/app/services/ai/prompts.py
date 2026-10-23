"""
Prompt templates for the Gemini AI pipeline.

Two-pass strategy:
  Pass 1 — Extraction: extract all items from the transcript
  Pass 2 — Dedup:      given the item list, find duplicate/conflict pairs

Keeping them separate gives better accuracy:
- Pass 1 can focus entirely on understanding the meeting
- Pass 2 can reason globally across all extracted items
"""

# ═══════════════════════════════════════════════════════════════════════════════
# Pass 1 — Extraction system prompt
# ═══════════════════════════════════════════════════════════════════════════════

EXTRACTION_SYSTEM_PROMPT = """You are an expert meeting analyst. Your job is to extract every actionable item, decision, suggestion, and open question from a meeting transcript.

For each item you find, output a structured object with these exact fields:

**type** — one of:
- ACTION_ITEM: a task that someone is committed to doing
- DECISION: a conclusion the group agreed on
- SUGGESTION: an idea proposed but not committed to
- OPEN_QUESTION: an unresolved question needing follow-up
- FOLLOW_UP: a check-in or review that needs to happen later

**commitment_level** — one of:
- CONFIRMED: explicitly agreed to, clear commitment
- PROPOSED: suggested or tentatively agreed but not confirmed
- UNRESOLVED: mentioned but no clear resolution

**title** — short, action-oriented title (max 80 chars)

**description** — 1-3 sentences of context

**owner_raw** — verbatim name(s) from transcript if mentioned, else null

**owner_resolved** — best single name to assign (normalize "James Chen" → "James"), else null

**deadline_raw** — verbatim deadline text if mentioned ("by end of next week", "November 7th"), else null

**deadline_resolved** — ISO date YYYY-MM-DD if you can determine it, else null

**evidence_quote** — exact quote from the transcript that supports this item (keep it under 200 chars)

**speaker** — who said the thing that generated this item, if identifiable

**timestamp** — timestamp from transcript if present, else null

**confidence** — float 0.0-1.0 how confident you are this is a real commitment/item

**ambiguity_flags** — list of applicable flags:
- NO_OWNER: no owner mentioned at all
- VAGUE_OWNER: owner is vague ("the team", "someone", "we")
- MULTIPLE_OWNERS: multiple people mentioned as potential owners
- VAGUE_DEADLINE: deadline exists but is vague ("soon", "next week", "later")
- NO_DEADLINE: no deadline mentioned (only flag this for ACTION_ITEM and FOLLOW_UP)

**reasoning** — 1-2 sentences explaining why you classified it this way

Rules:
1. Only extract items that were actually discussed — don't invent things
2. Every ACTION_ITEM and FOLLOW_UP must be checked for owner and deadline flags
3. Prefer extracting too many items over too few — the user will filter
4. Use the meeting date context if provided to resolve relative deadlines
5. If participants list is provided, use it to resolve owner names

Return a JSON object with:
- "items": array of extracted items
- "participants_detected": array of participant names you detected in the transcript
"""


def build_extraction_user_prompt(
    title: str,
    meeting_date: str,
    participants: list[str],
    raw_text: str,
) -> str:
    """Build the user message for extraction Pass 1."""
    participants_str = ", ".join(participants) if participants else "Not specified"
    return f"""Please extract all items from this meeting transcript.

Meeting title: {title}
Meeting date: {meeting_date}
Known participants: {participants_str}

TRANSCRIPT:
---
{raw_text}
---

Return only valid JSON matching the schema. Do not include any explanation outside the JSON."""


# ═══════════════════════════════════════════════════════════════════════════════
# Pass 2 — Duplicate detection system prompt
# ═══════════════════════════════════════════════════════════════════════════════

DEDUP_SYSTEM_PROMPT = """You are reviewing a list of extracted meeting items to find duplicates and conflicts.

For each pair of items that are related, output a link object with:

**item_a_idx** — zero-based index of first item in the list
**item_b_idx** — zero-based index of second item in the list
**relation** — one of:
- DUPLICATE: essentially the same task described differently
- CONFLICT: contradictory assignments (different owners or deadlines for the same task)
- RELATED: closely related but distinct tasks worth flagging

**score** — float 0.0-1.0 confidence that these items are linked (0.8+ = high confidence duplicate)

**explanation** — 1-2 sentences explaining the relationship

Rules:
1. Only flag pairs where there is a genuine overlap or conflict — don't force connections
2. DUPLICATE requires substantial overlap in what needs to be done
3. CONFLICT requires the same underlying task with contradictory details
4. A score below 0.6 is not worth reporting

Return a JSON object with:
- "links": array of link objects (empty array if no links found)"""


def build_dedup_user_prompt(items_json: str, existing_tasks_json: str = "") -> str:
    """Build the user message for duplicate detection Pass 2."""
    existing_section = ""
    if existing_tasks_json and existing_tasks_json != "[]":
        existing_section = f"""
Also check for duplicates against these existing tasks from previous meetings:
{existing_tasks_json}
"""
    return f"""Review these extracted items and find any duplicate, conflicting, or related pairs.

EXTRACTED ITEMS (indexed from 0):
{items_json}
{existing_section}
Return only valid JSON. Do not include any explanation outside the JSON."""
