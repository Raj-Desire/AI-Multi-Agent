"""
Knowledge Base Repository
Provides tenant-isolated persistence for DocumentMetadata and DocumentChunk entities in Azure Cosmos DB
with an ultra-fast In-Memory Vector Cosine matrix fallback for local development.
"""

import asyncio
import re
import time
from typing import List, Optional, Dict, Any, Tuple
from app.models.knowledge_document import DocumentMetadata, DocumentChunk, KnowledgeSearchResult
from app.services.vector_embedding_service import VectorEmbeddingService
from app.core.cosmos import get_knowledge_documents_container, get_knowledge_chunks_container


class KnowledgeRepository:
    """Repository managing document metadata and partitioned vector chunks."""

    def __init__(self):
        # In-memory stores fallback: { org_id: { doc_id: DocumentMetadata } }
        self._doc_memory_store: Dict[str, Dict[str, DocumentMetadata]] = {}
        # { org_id: { chunk_id: DocumentChunk } }
        self._chunk_memory_store: Dict[str, Dict[str, DocumentChunk]] = {}

    # -------------------------------------------------------------
    # Document Metadata CRUD
    # -------------------------------------------------------------
    async def save_document(self, doc: DocumentMetadata) -> DocumentMetadata:
        """Persists or updates document metadata."""
        org_id = doc.organization_id
        if org_id not in self._doc_memory_store:
            self._doc_memory_store[org_id] = {}
        self._doc_memory_store[org_id][doc.id] = doc

        def _sync_save():
            container = get_knowledge_documents_container()
            if not container:
                return
            try:
                container.upsert_item(body=doc.model_dump(mode="json"))
            except Exception as e:
                print(f"[KnowledgeRepository] Cosmos DB upsert warning for doc {doc.id}: {e}")

        await asyncio.to_thread(_sync_save)
        return doc

    async def get_document_by_id(self, org_id: str, doc_id: str) -> Optional[DocumentMetadata]:
        """Retrieves document metadata by ID enforcing tenant isolation."""
        if org_id in self._doc_memory_store and doc_id in self._doc_memory_store[org_id]:
            return self._doc_memory_store[org_id][doc_id]

        def _sync_get():
            container = get_knowledge_documents_container()
            if not container:
                return None
            try:
                item = container.read_item(item=doc_id, partition_key=org_id)
                return DocumentMetadata.model_validate(item)
            except Exception:
                return None

        return await asyncio.to_thread(_sync_get)

    def get_document_by_id_sync(self, org_id: str, doc_id: str) -> Optional[DocumentMetadata]:
        """Synchronously retrieves document metadata by ID."""
        if org_id in self._doc_memory_store and doc_id in self._doc_memory_store[org_id]:
            return self._doc_memory_store[org_id][doc_id]

        container = get_knowledge_documents_container()
        if not container:
            return None
        try:
            item = container.read_item(item=doc_id, partition_key=org_id)
            return DocumentMetadata.model_validate(item)
        except Exception:
            return None

    def get_chunks_for_document_ids_sync(self, org_id: str, document_ids: List[str], max_chunks_per_doc: int = 4) -> List[DocumentChunk]:
        """Synchronously retrieves document chunks for specific document IDs to build static grounding in prompt."""
        if not document_ids:
            return []

        doc_set = set(document_ids)
        # Check memory store first
        if org_id in self._chunk_memory_store:
            matching = [c for c in self._chunk_memory_store[org_id].values() if c.document_id in doc_set]
            if matching:
                # Group by document_id and limit
                res = []
                by_doc = {}
                for c in matching:
                    by_doc.setdefault(c.document_id, []).append(c)
                for d_id, chks in by_doc.items():
                    chks.sort(key=lambda x: x.chunk_index)
                    res.extend(chks[:max_chunks_per_doc])
                return res

        # Fetch from container
        container = get_knowledge_chunks_container()
        if not container:
            return []
        try:
            query = "SELECT * FROM c WHERE c.organization_id = @org_id"
            params = [{"name": "@org_id", "value": org_id}]
            items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=False))
            all_chunks = [DocumentChunk.model_validate(i) for i in items if i.get("document_id") in doc_set]
            
            # Cache
            if org_id not in self._chunk_memory_store:
                self._chunk_memory_store[org_id] = {}
            for c in all_chunks:
                self._chunk_memory_store[org_id][c.id] = c

            by_doc = {}
            for c in all_chunks:
                by_doc.setdefault(c.document_id, []).append(c)
            res = []
            for d_id, chks in by_doc.items():
                chks.sort(key=lambda x: x.chunk_index)
                res.extend(chks[:max_chunks_per_doc])
            return res
        except Exception:
            return []

    async def list_documents_by_org(self, org_id: str) -> List[DocumentMetadata]:
        """Lists all uploaded documents for a tenant."""
        def _sync_list():
            container = get_knowledge_documents_container()
            if not container:
                return list(self._doc_memory_store.get(org_id, {}).values())
            query = "SELECT * FROM c WHERE c.organization_id = @org_id ORDER BY c.created_at DESC"
            params = [{"name": "@org_id", "value": org_id}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=False))
                return [DocumentMetadata.model_validate(i) for i in items]
            except Exception:
                return list(self._doc_memory_store.get(org_id, {}).values())

        docs = await asyncio.to_thread(_sync_list)
        # Sort descending by created_at
        return sorted(docs, key=lambda d: d.created_at, reverse=True)

    async def delete_chunks_for_document(self, org_id: str, doc_id: str):
        """Purges only the vector chunks for a document while keeping document metadata intact."""
        # Delete from memory chunks
        if org_id in self._chunk_memory_store:
            to_del = [cid for cid, chk in self._chunk_memory_store[org_id].items() if chk.document_id == doc_id]
            for cid in to_del:
                del self._chunk_memory_store[org_id][cid]

        def _sync_delete_chunks():
            chunk_container = get_knowledge_chunks_container()
            if chunk_container:
                query = "SELECT c.id FROM c WHERE c.organization_id = @org_id AND c.document_id = @doc_id"
                params = [{"name": "@org_id", "value": org_id}, {"name": "@doc_id", "value": doc_id}]
                try:
                    items = list(chunk_container.query_items(query=query, parameters=params, enable_cross_partition_query=False))
                    for itm in items:
                        chunk_container.delete_item(item=itm["id"], partition_key=org_id)
                except Exception:
                    pass

        await asyncio.to_thread(_sync_delete_chunks)

    async def delete_document(self, org_id: str, doc_id: str) -> bool:
        """Deletes document metadata and all associated vector chunks (cascading delete)."""
        if org_id in self._doc_memory_store and doc_id in self._doc_memory_store[org_id]:
            del self._doc_memory_store[org_id][doc_id]

        await self.delete_chunks_for_document(org_id, doc_id)

        def _sync_delete_doc():
            doc_container = get_knowledge_documents_container()
            if doc_container:
                try:
                    doc_container.delete_item(item=doc_id, partition_key=org_id)
                except Exception:
                    pass

        await asyncio.to_thread(_sync_delete_doc)
        return True

    # -------------------------------------------------------------
    # Vector Chunk Persistence & Cosine Similarity Search
    # -------------------------------------------------------------
    async def save_chunks(self, chunks: List[DocumentChunk]):
        """Saves a batch of embedded chunks for an organization."""
        if not chunks:
            return

        for chk in chunks:
            org_id = chk.organization_id
            if org_id not in self._chunk_memory_store:
                self._chunk_memory_store[org_id] = {}
            self._chunk_memory_store[org_id][chk.id] = chk

        def _sync_save():
            container = get_knowledge_chunks_container()
            if not container:
                return
            from concurrent.futures import ThreadPoolExecutor
            failed: List[str] = []

            def _upsert_one(chk_item):
                last_err = None
                for _ in range(3):
                    try:
                        container.upsert_item(body=chk_item.model_dump(mode="json"))
                        return
                    except Exception as e:  # throttling (429) or transient network errors
                        last_err = e
                        time.sleep(0.5)
                print(f"[KnowledgeRepository] Error saving chunk {chk_item.id}: {last_err}")
                failed.append(chk_item.id)

            # Up to 10 concurrent writers (sequential writes of 100+ chunks took 30s+).
            workers = min(10, max(2, len(chunks)))
            with ThreadPoolExecutor(max_workers=workers) as executor:
                list(executor.map(_upsert_one, chunks))
            if failed:
                # Never report a document as INDEXED when part of it is missing from the vector store.
                raise RuntimeError(f"{len(failed)} of {len(chunks)} knowledge chunks could not be saved to the database.")

        await asyncio.to_thread(_sync_save)

    async def list_chunks_for_org(self, org_id: str) -> List[DocumentChunk]:
        """All chunks of an organization (database copy merged with the in-memory store)."""
        def _sync_fetch():
            container = get_knowledge_chunks_container()
            if not container:
                return []
            query = "SELECT * FROM c WHERE c.organization_id = @org_id"
            params = [{"name": "@org_id", "value": org_id}]
            try:
                items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=False))
                return [DocumentChunk.model_validate(i) for i in items]
            except Exception:
                return []

        merged: Dict[str, DocumentChunk] = {c.id: c for c in await asyncio.to_thread(_sync_fetch)}
        merged.update(self._chunk_memory_store.get(org_id, {}))
        return list(merged.values())

    @staticmethod
    def _cosine_scores(query_embedding: List[float], chunks: List[DocumentChunk]) -> List[float]:
        """Cosine similarity of the query against every chunk (numpy matrix product when available)."""
        try:
            import numpy as np
            q = np.asarray(query_embedding, dtype=np.float32)
            dim = q.shape[0]
            matrix = np.zeros((len(chunks), dim), dtype=np.float32)
            for i, c in enumerate(chunks):
                if len(c.embedding) == dim:
                    matrix[i] = c.embedding
            norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(q)
            norms[norms == 0] = 1.0
            return np.clip(matrix @ q / norms, 0.0, 1.0).tolist()
        except ImportError:
            return [VectorEmbeddingService.cosine_similarity(query_embedding, c.embedding) for c in chunks]

    _STOPWORDS = frozenset(
        "the and for with that this what which about have your you are can does do tell please like any "
        "from into how would could should there their them they will just some more also been being".split()
    )

    @classmethod
    def _lexical_scores(cls, query_text: str, chunks: List[DocumentChunk]) -> List[float]:
        """Fraction (0..1) of the query's distinctive terms present in each chunk; exact record IDs count double."""
        terms = {t for t in re.findall(r"[a-z0-9][a-z0-9+#.\-]*", query_text.lower()) if len(t) > 2 and t not in cls._STOPWORDS}
        if not terms:
            return [0.0] * len(chunks)
        ids = {t for t in terms if re.fullmatch(r"[a-z]{2,5}-\d{1,3}", t)}
        out = []
        for c in chunks:
            hay = f"{c.section_title or ''} {c.content}".lower()
            hits = sum(1 for t in terms if t in hay)
            score = hits / len(terms)
            if ids and any(i in hay for i in ids):
                score = min(1.0, score + 0.5)
                if any(i in (c.section_title or "").lower() for i in ids):
                    score += 1.0  # the record itself, not an index/table that merely lists its ID
            out.append(score)
        return out

    async def search_vector_chunks(
        self,
        org_id: str,
        query_embedding: List[float],
        top_k: int = 3,
        min_similarity: float = 0.50,
        category: Optional[str] = None,
        document_ids: Optional[List[str]] = None,
        query_text: Optional[str] = None
    ) -> List[KnowledgeSearchResult]:
        """
        Executes vector similarity search against tenant's document chunks.
        Optionally filters chunks by specific document IDs for scoped agent retrieval.
        First tries Cosmos DB native VectorDistance if enabled, then computes cosine similarity.
        """
        # 1. Fetch chunks for organization
        all_chunks: List[DocumentChunk] = []
        
        # Check memory store
        if org_id in self._chunk_memory_store:
            all_chunks = list(self._chunk_memory_store[org_id].values())

        # If memory store empty, fetch from Cosmos DB container
        if not all_chunks:
            def _sync_fetch():
                container = get_knowledge_chunks_container()
                if not container:
                    return []
                query = "SELECT * FROM c WHERE c.organization_id = @org_id"
                params = [{"name": "@org_id", "value": org_id}]
                try:
                    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=False))
                    return [DocumentChunk.model_validate(i) for i in items]
                except Exception:
                    return []

            all_chunks = await asyncio.to_thread(_sync_fetch)
            # Cache to memory
            if org_id not in self._chunk_memory_store:
                self._chunk_memory_store[org_id] = {}
            for c in all_chunks:
                self._chunk_memory_store[org_id][c.id] = c

        if not all_chunks:
            return []

        # Filter by specific document IDs if supplied
        if document_ids is not None and len(document_ids) > 0:
            doc_id_set = set(document_ids)
            all_chunks = [chk for chk in all_chunks if chk.document_id in doc_id_set]

        if not all_chunks:
            return []

        # 2. Score every chunk: cosine similarity (vectorised) plus a small lexical boost for exact terms/IDs
        candidates = [chk for chk in all_chunks if chk.embedding]
        if not candidates:
            return []
        sims = self._cosine_scores(query_embedding, candidates)
        lexical = self._lexical_scores(query_text, candidates) if query_text else [0.0] * len(candidates)

        scored_results: List[Tuple[float, DocumentChunk]] = []
        for chk, sim, lex in zip(candidates, sims, lexical):
            if sim >= min_similarity or lex >= 0.5:
                scored_results.append((sim + 0.15 * lex, chk))

        # 3. Sort descending by combined score
        scored_results.sort(key=lambda x: x[0], reverse=True)

        # 4. Resolve document metadata for matches
        results: List[KnowledgeSearchResult] = []
        for score, chk in scored_results:
            doc_meta = await self.get_document_by_id(org_id, chk.document_id)
            doc_name = doc_meta.title if (doc_meta and doc_meta.title) else (doc_meta.file_name if doc_meta else "Knowledge Document")
            doc_cat = doc_meta.category if doc_meta else "General"

            # Filter by category if requested
            if category and doc_cat.lower() != category.lower():
                continue

            results.append(KnowledgeSearchResult(
                chunk_id=chk.id,
                document_id=chk.document_id,
                document_name=doc_name,
                content=chk.content,
                similarity_score=round(min(score, 1.0), 4),
                page_number=chk.page_number,
                section_title=chk.section_title,
                category=doc_cat
            ))

            if len(results) >= top_k:
                break

        return results


# Global singleton instance
knowledge_repository = KnowledgeRepository()
