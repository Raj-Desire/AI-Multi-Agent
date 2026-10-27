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
from docx.table import Table
from docx.text.paragraph import Paragraph


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
        blocks: List[str] = []

        # Walk the body in document order so tables (metadata blocks, price lists, comparison grids) are kept
        # next to the paragraphs they belong to. doc.paragraphs alone silently drops every table.
        for child in doc.element.body.iterchildren():
            tag = child.tag.rsplit("}", 1)[-1]
            if tag == "p":
                para = Paragraph(child, doc)
                t = para.text.strip()
                if not t:
                    continue
                style = (para.style.name if para.style is not None else "") or ""
                m = re.match(r"Heading\s*(\d)", style)
                if m:
                    blocks.append(f"{'#' * min(int(m.group(1)), 6)} {t}")
                elif style.startswith("List"):
                    blocks.append(f"- {t}")
                else:
                    blocks.append(t)
            elif tag == "tbl":
                table_text = DocumentParserService._table_to_text(Table(child, doc))
                if table_text:
                    blocks.append(table_text)

        clean_text = DocumentParserService._clean_extracted_text("\n\n".join(blocks))
        return [(1, clean_text)] if clean_text else []

    @staticmethod
    def _table_to_text(table) -> str:
        """Renders a table as lines: 'Label: value' for 2-column grids, 'Header: cell' for wider ones."""
        rows: List[List[str]] = []
        for row in table.rows:
            cells: List[str] = []
            seen = set()
            for cell in row.cells:
                if id(cell._tc) in seen:  # merged cells repeat the same underlying cell
                    continue
                seen.add(id(cell._tc))
                cells.append(" ".join(cell.text.split()))
            if any(cells):
                rows.append(cells)
        if not rows:
            return ""

        width = max(len(r) for r in rows)
        if width == 1:
            return "\n".join(r[0] for r in rows if r[0])
        if width == 2:
            return "\n".join(f"{r[0]}: {r[1]}" if len(r) > 1 and r[1] else r[0] for r in rows)

        header, body = rows[0], rows[1:]
        if not body:
            return " | ".join(header)
        lines = []
        for r in body:
            parts = [f"{header[i]}: {v}" if i < len(header) and header[i] and v else v for i, v in enumerate(r) if v]
            lines.append("; ".join(parts))
        return "\n".join(lines)

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
            if re.search(r"(?m)^#{1,6} \S", page_text):
                for content, title in DocumentParserService._chunk_by_headings(page_text, chunk_size_words * 2):
                    chunks.append({
                        "chunk_index": chunk_index,
                        "content": content,
                        "token_count": int(len(content.split()) * 1.3),
                        "page_number": page_num,
                        "section_title": title[:120]
                    })
                    chunk_index += 1
                continue

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

    @staticmethod
    def _chunk_by_headings(text: str, max_words: int) -> List[Tuple[str, str]]:
        """
        Splits heading-structured text (lines starting with '#') into one chunk per smallest section, so a
        project/product/FAQ record stays whole. Every chunk starts with its heading path (e.g. the record ID and
        title), which both anchors the embedding and tells the model what it is reading. Oversized sections are
        split on line boundaries; tiny sections are merged into the next one.
        """
        sections: List[Tuple[str, List[str], List[str]]] = []  # (title, heading path, body lines)
        path: List[str] = []
        for line in text.split("\n"):
            m = re.match(r"^(#{1,6}) (.+)$", line)
            if m:
                level = len(m.group(1))
                path = path[:level - 1] + [m.group(2).strip()]
                sections.append((m.group(2).strip(), list(path), []))
            elif line.strip():
                if not sections:
                    sections.append(("Introduction", ["Introduction"], []))
                sections[-1][2].append(line.strip())

        out: List[Tuple[str, str]] = []
        carry: List[str] = []
        for title, hpath, body in sections:
            if not body and not carry:
                continue
            header = "[" + " > ".join(hpath[-2:]) + "]"
            body_words = sum(len(b.split()) for b in body)
            if body_words < 40 and len(hpath) <= 2:
                # intro-only heading: keep it and prepend to the next section
                carry.extend(body)
                continue
            lines = carry + body
            carry = []
            parts: List[List[str]] = [[]]
            count = 0
            for ln in lines:
                w = len(ln.split())
                if count + w > max_words and parts[-1]:
                    parts.append([])
                    count = 0
                parts[-1].append(ln)
                count += w
            for i, part in enumerate(parts):
                label = header if i == 0 else f"{header} (continued)"
                out.append((label + "\n" + "\n".join(part), title))
        if carry:
            out.append(("\n".join(carry), "Introduction"))
        return out
