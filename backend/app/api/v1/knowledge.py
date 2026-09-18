import time
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel, Field

from app.core.dependencies import get_tenant_context, TenantContext
from app.models.knowledge_document import DocumentMetadata, KnowledgeSearchResult
from app.services.knowledge_service import knowledge_service

router = APIRouter(prefix="/knowledge", tags=["Knowledge & Vector RAG"])


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query string")
    category: Optional[str] = Field(None, description="Optional category filter")
    document_ids: Optional[List[str]] = Field(None, description="Optional document IDs filter to restrict search scope")
    top_k: int = Field(default=3, ge=1, le=10, description="Max matching chunks to return")
    min_similarity: float = Field(default=0.45, ge=0.0, le=1.0, description="Minimum cosine similarity score")


class KnowledgeSearchResponse(BaseModel):
    query: str
    results: List[KnowledgeSearchResult]
    latency_ms: float
    total_results: int


@router.post("/upload", response_model=DocumentMetadata, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    category: str = Form("General"),
    description: Optional[str] = Form(None),
    document_id: Optional[str] = Form(None),
    tenant: TenantContext = Depends(get_tenant_context)
):
    """
    Upload and index a document (PDF, DOCX, TXT) into Azure Cosmos DB Vector Knowledge base.
    If document_id is supplied, updates and re-indexes the existing document in-place.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a valid filename")

    # Read binary content
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file payload: {str(e)}")

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if len(content) > 25 * 1024 * 1024:  # 25 MB max
        raise HTTPException(status_code=413, detail="File size exceeds maximum permitted limit (25MB)")

    doc_title = title.strip() if title and title.strip() else file.filename

    doc = await knowledge_service.ingest_document(
        organization_id=tenant.organization_id,
        filename=file.filename,
        file_bytes=content,
        title=doc_title,
        category=category,
        description=description,
        uploaded_by=tenant.user_id or tenant.email,
        document_id=document_id
    )

    return doc


@router.put("/documents/{document_id}", response_model=DocumentMetadata, status_code=status.HTTP_200_OK)
async def update_document(
    document_id: str,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tenant: TenantContext = Depends(get_tenant_context)
):
    """
    Re-upload and re-index an existing document in-place, preserving its document_id.
    All agents attached to this document automatically receive the updated knowledge immediately.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a valid filename")

    # Read binary content
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file payload: {str(e)}")

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File size exceeds maximum permitted limit (25MB)")

    doc_title = title.strip() if title and title.strip() else None

    doc = await knowledge_service.ingest_document(
        organization_id=tenant.organization_id,
        filename=file.filename,
        file_bytes=content,
        title=doc_title,
        category=category or "General",
        description=description,
        uploaded_by=tenant.user_id or tenant.email,
        document_id=document_id
    )

    return doc


@router.get("/documents", response_model=List[DocumentMetadata])
async def list_documents(
    tenant: TenantContext = Depends(get_tenant_context)
):
    """
    List all knowledge documents indexed for the current user's organization.
    """
    docs = await knowledge_service.list_documents(tenant.organization_id)
    return docs


@router.delete("/documents/{document_id}", status_code=status.HTTP_200_OK)
async def delete_document(
    document_id: str,
    tenant: TenantContext = Depends(get_tenant_context)
):
    """
    Delete a knowledge document and purge its embedded chunks from Cosmos DB.
    """
    success = await knowledge_service.delete_document(
        document_id=document_id,
        organization_id=tenant.organization_id
    )
    if not success:
        raise HTTPException(status_code=404, detail="Document not found or already deleted")
    return {"status": "success", "message": f"Document {document_id} and its vector chunks were purged successfully"}


@router.post("/search", response_model=KnowledgeSearchResponse)
async def search_knowledge(
    request: KnowledgeSearchRequest,
    tenant: TenantContext = Depends(get_tenant_context)
):
    """
    Vector similarity search sandbox for grounding telephony AI prompts.
    """
    start_time = time.perf_counter()
    results = await knowledge_service.search_knowledge(
        organization_id=tenant.organization_id,
        query=request.query,
        top_k=request.top_k,
        min_similarity=request.min_similarity,
        category=request.category,
        document_ids=request.document_ids
    )
    latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return KnowledgeSearchResponse(
        query=request.query,
        results=results,
        latency_ms=latency_ms,
        total_results=len(results)
    )
