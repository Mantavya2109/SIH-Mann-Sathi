import os
import json
from pathlib import Path
from dotenv import load_dotenv
from groq import Groq
from backend.app.services.rag_ingest import match_provisions

load_dotenv(dotenv_path=Path(__file__).resolve().parents[3] / ".env")
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def generate_recommendation(distress_summary: str, case_stage: str = None) -> dict:
    """
    Given a plain-language description of the case's distress situation,
    retrieves relevant PoA Act provisions and generates a grounded recommendation.

    distress_summary: e.g. "Victim showing signs of fear and intimidation,
                             possible threats from accused party"
    case_stage: optional, e.g. "FIR", "trial", "chargesheet" — for future filtering
    """
    retrieved = match_provisions(distress_summary, match_count=3)

    if not retrieved:
        return {
            "recommendation_text": "No matching provisions found. Manual review recommended.",
            "cited_provisions": []
        }

    context = "\n\n".join(
        f"[{r['section_ref']}] {r['text_chunk']}" for r in retrieved
    )

    prompt = f"""You are assisting a counsellor working with a victim under the
SC/ST (Prevention of Atrocities) Act. Based ONLY on the provisions below,
write a short, practical recommendation (2-3 sentences) for what relief or
support the counsellor should consider raising with the victim.

Do NOT invent any provision, amount, or right not explicitly stated below.
If the provisions don't clearly apply, say so honestly.

Case situation: {distress_summary}

Relevant provisions:
{context}

Respond ONLY as JSON:
{{"recommendation_text": "...", "cited_sections": ["section_ref", ...]}}"""

    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0
    )

    result = json.loads(response.choices[0].message.content)

    return {
        "recommendation_text": result.get("recommendation_text", ""),
        "cited_provisions": [
            {"section_ref": r["section_ref"], "text_chunk": r["text_chunk"], "similarity": r["similarity"]}
            for r in retrieved
        ]
    }


if __name__ == "__main__":
    result = generate_recommendation(
        "Victim reports being repeatedly intimidated and threatened by the accused's family, afraid to leave home"
    )
    print("Recommendation:")
    print(result["recommendation_text"])
    print()
    print("Cited provisions:")
    for p in result["cited_provisions"]:
        print(f"  [{p['section_ref']}] similarity: {p['similarity']:.3f}")