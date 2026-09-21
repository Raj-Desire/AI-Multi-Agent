from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class DocumentMetadata(BaseModel):
    """Metadata model representing an uploaded knowledge base document."""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="Unique document ID, e.g. doc_abc123")
    organization_id: str = Field(description="Tenant organization ID for multi-tenant isolation")
    file_name: str = Field(description="Original filename, e.g. Pricing_Guide.pdf")
    file_type: str = Field(description="pdf, docx, txt, markdown, faq")
    file_size_bytes: int = Field(default=0)
    title: Optional[str] = Field(default=None)
    description: Optional[str] = Field(default=None)
    category: str = Field(default="General", description="General, Product, Billing, Policy, Technical")
    status: str = Field(default="INDEXED", description="INDEXED, PROCESSING, FAILED")
    total_chunks: int = Field(default=0)
    total_tokens: int = Field(default=0)
    error_message: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocumentChunk(BaseModel):
    """A granular vector-embedded text chunk of a knowledge document."""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="Unique chunk ID, e.g. chk_abc123")
    document_id: str = Field(description="Parent document ID")
    organization_id: str = Field(description="Tenant organization ID partition key")
    chunk_index: int = Field(default=0)
    content: str = Field(description="Extracted clean text content for retrieval")
    token_count: int = Field(default=0)
    page_number: Optional[int] = Field(default=None)
    section_title: Optional[str] = Field(default=None)
    embedding: Optional[List[float]] = Field(default=None, description="1536-dimensional vector embedding")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class KnowledgeSearchResult(BaseModel):
    """Semantic vector search match returned for telephony RAG grounding."""
    chunk_id: str
    document_id: str
    document_name: str
    content: str
    similarity_score: float
    chunk_index: int = 0
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    category: Optional[str] = None

    @property
    def document_title(self) -> str:
        return self.document_name
