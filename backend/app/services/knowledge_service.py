"""
Knowledge Base Service
Orchestrates document uploading, binary parsing, vector chunk generation,
document library management, and real-time semantic RAG retrieval for voice calls.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Union

from app.models.knowledge_document import DocumentMetadata, DocumentChunk, KnowledgeSearchResult
from app.repositories.knowledge_repository import KnowledgeRepository, knowledge_repository
from app.services.document_parser_service import DocumentParserService
from app.services.vector_embedding_service import VectorEmbeddingService
from app.core.dependencies import TenantContext


class KnowledgeService:
    """Service handling multi-tenant document ingestion, chunking, and semantic vector retrieval."""

    def __init__(self, repo: Optional[KnowledgeRepository] = None):
        self.repo = repo or knowledge_repository

    async def ingest_document(
        self,
        organization_id: Union[str, TenantContext],
        filename: str,
        file_bytes: bytes,
        title: Optional[str] = None,
        category: str = "General",
        description: Optional[str] = None,
        uploaded_by: Optional[str] = None,
        document_id: Optional[str] = None
    ) -> DocumentMetadata:
        """
        Parses an uploaded file, extracts text, computes vector embeddings, and saves chunks.
        If document_id is provided, updates the existing document in-place, preserving its ID so
        all attached agents automatically receive the latest knowledge without breaking links.
        """
        org_id = organization_id.organization_id if isinstance(organization_id, TenantContext) else organization_id
        
        # Check if updating an existing document
        existing_doc = None
        if document_id:
            existing_doc = await self.repo.get_document_by_id(org_id, document_id)
            doc_id = document_id
            # Purge existing chunks for clean in-place replacement
            await self.repo.delete_chunks_for_document(org_id, doc_id)
        else:
            doc_id = f"doc_{uuid.uuid4().hex[:12]}"
        
        # Determine file type
        ext = filename.lower().split(".")[-1] if "." in filename else "txt"
        if ext == "pdf":
            pages_content = DocumentParserService.extract_text_from_pdf(file_bytes)
        elif ext in ["docx", "doc"]:
            pages_content = DocumentParserService.extract_text_from_docx(file_bytes)
        else:
            pages_content = DocumentParserService.extract_text_from_plain(file_bytes)

        if not pages_content or not any(text.strip() for _, text in pages_content):
            raise ValueError(f"No readable text could be extracted from '{filename}'. Please ensure the document is not an empty or scanned-image-only PDF.")

        # Chunk document text into ~300-400 token windows
        raw_chunks = DocumentParserService.chunk_document_text(pages_content, chunk_size_words=250, overlap_words=40)
        
        # Prepend document title and category to chunk embedding texts for rich semantic retrieval
        clean_doc_title = (title or filename).replace("_", " ").replace("-", " ")
        chunk_texts = [f"Document: {clean_doc_title} | Category: {category}\n{c['content']}" for c in raw_chunks]
        embeddings = await VectorEmbeddingService.get_embeddings_batch(chunk_texts)

        # Build DocumentChunk objects
        doc_chunks: List[DocumentChunk] = []
        total_tokens = 0

        for i, c in enumerate(raw_chunks):
            total_tokens += c["token_count"]
            chunk_obj = DocumentChunk(
                id=f"chk_{uuid.uuid4().hex[:12]}",
                document_id=doc_id,
                organization_id=org_id,
                chunk_index=c["chunk_index"],
                content=c["content"],
                token_count=c["token_count"],
                page_number=c["page_number"],
                section_title=c["section_title"],
                embedding=embeddings[i] if i < len(embeddings) else None,
                created_at=datetime.now(timezone.utc)
            )
            doc_chunks.append(chunk_obj)

        # Save chunks to vector store
        await self.repo.save_chunks(doc_chunks)

        # Create & persist DocumentMetadata
        metadata = DocumentMetadata(
            id=doc_id,
            organization_id=org_id,
            file_name=filename,
            file_type=ext,
            file_size_bytes=len(file_bytes),
            title=title or (existing_doc.title if existing_doc else filename),
            description=description if description is not None else (existing_doc.description if existing_doc else None),
            category=category or (existing_doc.category if existing_doc else "General"),
            status="INDEXED",
            total_chunks=len(doc_chunks),
            total_tokens=total_tokens,
            created_by=existing_doc.created_by if existing_doc else (uploaded_by or "system"),
            created_at=existing_doc.created_at if existing_doc else datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        saved_doc = await self.repo.save_document(metadata)
        return saved_doc

    async def list_documents(self, organization_id: Union[str, TenantContext]) -> List[DocumentMetadata]:
        """Lists all indexed documents for the tenant."""
        org_id = organization_id.organization_id if isinstance(organization_id, TenantContext) else organization_id
        return await self.repo.list_documents_by_org(org_id)

    async def delete_document(self, document_id: str, organization_id: Union[str, TenantContext]) -> bool:
        """Deletes a document and its vector chunks."""
        org_id = organization_id.organization_id if isinstance(organization_id, TenantContext) else organization_id
        return await self.repo.delete_document(org_id, document_id)

    async def search_knowledge(
        self,
        organization_id: Union[str, TenantContext],
        query: str,
        top_k: int = 3,
        min_similarity: float = 0.45,
        category: Optional[str] = None,
        document_ids: Optional[List[str]] = None
    ) -> List[KnowledgeSearchResult]:
        """
        Computes query embedding and executes fast vector similarity retrieval.
        """
        if not query or not query.strip():
            return []

        org_id = organization_id.organization_id if isinstance(organization_id, TenantContext) else organization_id
        query_embedding = await VectorEmbeddingService.get_embedding(query.strip())
        results = await self.repo.search_vector_chunks(
            org_id=org_id,
            query_embedding=query_embedding,
            top_k=top_k,
            min_similarity=min_similarity,
            category=category,
            document_ids=document_ids
        )
        return results

    async def get_grounding_context_for_call(
        self,
        organization_id: Union[str, TenantContext],
        user_transcript: str,
        document_ids: Optional[List[str]] = None
    ) -> Optional[str]:
        """
        Retrieves relevant document excerpts based on user utterances for live injection.
        """
        org_id = organization_id.organization_id if isinstance(organization_id, TenantContext) else organization_id
        matches = await self.search_knowledge(
            organization_id=org_id,
            query=user_transcript,
            top_k=2,
            min_similarity=0.45,
            document_ids=document_ids
        )
        if not matches:
            return None

        excerpts = []
        for m in matches:
            excerpts.append(f"Document ({m.document_name}): {m.content}")

        return "\n\n".join(excerpts)


# Global singleton instance
knowledge_service = KnowledgeService()
