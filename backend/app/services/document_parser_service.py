"""
Document Parsing & Text Extraction Service
Extracts high-fidelity plain text from PDFs, Word documents (.docx), and text files,
then splits into semantic chunks with sliding window overlap for phone call latency optimization.
"""

import io
import re
from typing import List, Tuple, Optional
import pypdf
import docx


class DocumentParserService:
    """Parses binary document payloads into clean text and semantic chunks."""

    @staticmethod
    def extract_text_from_pdf(file_bytes: bytes) -> List[Tuple[int, str]]:
        """
        Extracts text from PDF bytes returning a list of (page_number, page_text).
        """
        pages_content: List[Tuple[int, str]] = []
        try:
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            for idx, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                clean_text = DocumentParserService._clean_extracted_text(text)
                if clean_text:
                    pages_content.append((idx + 1, clean_text))
        except Exception as e:
            raise ValueError(f"Failed to extract text from PDF document: {e}")
        return pages_content

    @staticmethod
    def extract_text_from_docx(file_bytes: bytes) -> List[Tuple[int, str]]:
        """
        Extracts text paragraphs from DOCX bytes.
        """
        doc = docx.Document(io.BytesIO(file_bytes))
        paragraphs = []
        for p in doc.paragraphs:
            t = p.text.strip()
            if t:
                paragraphs.append(t)
        full_text = "\n\n".join(paragraphs)
        clean_text = DocumentParserService._clean_extracted_text(full_text)
        return [(1, clean_text)] if clean_text else []

    @staticmethod
    def extract_text_from_plain(file_bytes: bytes) -> List[Tuple[int, str]]:
        """
        Decodes UTF-8 / Latin-1 plain text.
        """
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin-1", errors="ignore")
        clean_text = DocumentParserService._clean_extracted_text(text)
        return [(1, clean_text)] if clean_text else []

    @staticmethod
    def _clean_extracted_text(text: str) -> str:
        """Removes excessive whitespace, null bytes, and non-printable characters."""
        if not text:
            return ""
        # Remove null bytes and carriage returns
        text = text.replace("\x00", " ").replace("\r\n", "\n").replace("\r", "\n")
        # Collapse multi-newlines into clean double-newlines
        text = re.sub(r"\n{3,}", "\n\n", text)
        # Collapse repetitive inline spaces
        text = re.sub(r"[ \t]{2,}", " ", text)
        return text.strip()

    @staticmethod
    def chunk_document_text(
        pages_content: List[Tuple[int, str]],
        chunk_size_words: int = 250,
        overlap_words: int = 50
    ) -> List[dict]:
        """
        Splits extracted pages into semantic chunks with overlap.
        Each chunk is optimized for fast telephone RAG context (~300-400 tokens).
        """
        chunks: List[dict] = []
        chunk_index = 0

        for page_num, page_text in pages_content:
            paragraphs = [p.strip() for p in page_text.split("\n\n") if p.strip()]
            
            # If page is short, keep as 1 chunk
            words = page_text.split()
            if len(words) <= chunk_size_words:
                chunks.append({
                    "chunk_index": chunk_index,
                    "content": page_text,
                    "token_count": int(len(words) * 1.3),
                    "page_number": page_num,
                    "section_title": paragraphs[0][:80] if paragraphs else None
                })
                chunk_index += 1
                continue

            # Sliding window over words
            start = 0
            while start < len(words):
                end = min(start + chunk_size_words, len(words))
                chunk_words = words[start:end]
                chunk_text = " ".join(chunk_words)

                chunks.append({
                    "chunk_index": chunk_index,
                    "content": chunk_text,
                    "token_count": int(len(chunk_words) * 1.3),
                    "page_number": page_num,
                    "section_title": f"Page {page_num} (Part {chunk_index + 1})"
                })
                chunk_index += 1

                if end >= len(words):
                    break
                start += (chunk_size_words - overlap_words)

        return chunks
