import os
import re
import sys
import subprocess
import tempfile
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
from sentence_transformers import SentenceTransformer
import pdfplumber

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
model = SentenceTransformer("all-MiniLM-L6-v2")


def convert_doc_to_pdf(doc_path: str) -> str:
    """Converts a .doc/.docx file to PDF using LibreOffice, returns the new PDF path."""
    output_dir = tempfile.gettempdir()
    subprocess.run([
        "soffice", "--headless", "--convert-to", "pdf",
        "--outdir", output_dir, doc_path
    ], check=True)

    pdf_name = Path(doc_path).stem + ".pdf"
    return str(Path(output_dir) / pdf_name)


def extract_text_from_pdf(pdf_path: str) -> str:
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"
    return full_text


def extract_text(file_path: str) -> str:
    """Auto-detects file type and extracts text — handles .pdf, .doc, .docx."""
    ext = Path(file_path).suffix.lower()

    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext in (".doc", ".docx"):
        print(f"Converting {file_path} to PDF first...")
        pdf_path = convert_doc_to_pdf(file_path)
        return extract_text_from_pdf(pdf_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Supported: .pdf, .doc, .docx")


def chunk_by_sections(raw_text: str) -> list[dict]:
    section_pattern = r'(?:^|\n)(\d+[A-Za-z]?\.\s|\(\d+\)\s|Section \d+[A-Za-z]?\(\d+\))'
    splits = re.split(section_pattern, raw_text)

    chunks = []
    if len(splits) > 1:
        for i in range(1, len(splits) - 1, 2):
            marker = splits[i].strip()
            content = splits[i + 1].strip()
            if len(content) > 20:
                chunks.append({"section_ref": marker, "text_chunk": content[:1000]})
    else:
        paragraphs = [p.strip() for p in raw_text.split("\n\n") if len(p.strip()) > 50]
        for idx, para in enumerate(paragraphs):
            chunks.append({"section_ref": f"paragraph_{idx+1}", "text_chunk": para[:1000]})

    return chunks


def embed_and_insert(chunks: list[dict], category: str = "general"):
    for chunk in chunks:
        embedding = model.encode(chunk["text_chunk"]).tolist()
        supabase.table("provisions").insert({
            "section_ref": chunk["section_ref"],
            "text_chunk": chunk["text_chunk"],
            "embedding": embedding,
            "category": category
        }).execute()
        print(f"Inserted: {chunk['section_ref']} — {chunk['text_chunk'][:60]}...")


def ingest_document(file_path: str, category: str = "general"):
    print(f"Extracting text from {file_path}...")
    raw_text = extract_text(file_path)
    print(f"Extracted {len(raw_text)} characters.")

    print("Chunking...")
    chunks = chunk_by_sections(raw_text)
    print(f"Found {len(chunks)} chunks.")

    print("Embedding and inserting into Supabase...")
    embed_and_insert(chunks, category)
    print("Done.")
def match_provisions(query: str, match_count: int = 3, category: str = None) -> list[dict]:
    """
    Embeds a query and retrieves the most relevant provisions from Supabase.
    """
    query_embedding = model.encode(query).tolist()

    response = supabase.rpc("match_provisions", {
        "query_embedding": query_embedding,
        "match_count": match_count,
        "filter_category": category
    }).execute()

    return response.data

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python rag_ingest.py <path_to_document> [category]")
        sys.exit(1)

    file_path = sys.argv[1]
    category = sys.argv[2] if len(sys.argv) > 2 else "general"
    ingest_document(file_path, category)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python rag_ingest.py <path_to_document> [category]")
        sys.exit(1)

    file_path = sys.argv[1]
    category = sys.argv[2] if len(sys.argv) > 2 else "general"
    ingest_document(file_path, category)

    # Quick retrieval test
    print("\n--- Testing retrieval ---")
    results = match_provisions("victim facing threats and intimidation, needs protection")
    for r in results:
        print(f"[{r['similarity']:.3f}] {r['section_ref']}: {r['text_chunk'][:100]}...")    