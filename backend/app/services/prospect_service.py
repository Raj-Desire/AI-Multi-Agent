import csv
import io
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from fastapi import HTTPException

from app.core.dependencies import TenantContext
from app.models.prospect import Prospect, ProspectStatus, ProspectSource
from app.repositories.prospect_repository import ProspectRepository
from app.repositories.call_repository import CallRepository
from app.schemas.prospect import (
    CreateProspectRequest,
    UpdateProspectRequest,
    ProspectResponse,
    ProspectPaginationResponse,
    CSVValidateResponse,
    CSVValidateRowDetail,
    CSVImportSummaryResponse,
)


def normalize_phone(value: Optional[str]) -> str:
    """
    Standardizes international phone numbers into clean E.164-compatible format:
    e.g. "+1 (415) 555-0123" -> "+14155550123"
         "415-555-0123"      -> "+14155550123"
         "14155550123"       -> "+14155550123"
         "+91 98765 43210"   -> "+919876543210"
         "919876543210"      -> "+919876543210"
         "09876543210"       -> "+919876543210"
    """
    if not value:
        return ""
    cleaned = str(value).strip()
    digits = "".join(c for c in cleaned if c.isdigit())
    if not digits:
        return ""

    if cleaned.startswith("+"):
        return f"+{digits}"

    # 10 digits standard (US / Canada domestic default)
    if len(digits) == 10:
        return f"+1{digits}"
    # 11 digits starting with 1 (US / Canada with country code)
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    # 11 digits starting with 0 (Indic domestic with leading 0)
    if len(digits) == 11 and digits.startswith("0"):
        return f"+91{digits[1:]}"
    # 12 digits starting with 91 (India with country code)
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"

    return f"+{digits}"


def is_valid_email(email: Optional[str]) -> bool:
    if not email or not email.strip():
        return True
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email.strip()))


class ProspectService:
    def __init__(
        self,
        repo: Optional[ProspectRepository] = None,
        call_repo: Optional[CallRepository] = None
    ):
        self.repo = repo or ProspectRepository()
        self.call_repo = call_repo or CallRepository()

    async def is_dnc_blocked(self, organization_id: str, phone_number: str) -> bool:
        """
        Checks if the destination phone number belongs to a prospect with 'Do Not Contact' status.
        """
        norm_phone = normalize_phone(phone_number)
        if not norm_phone:
            return False

        prospect = await self.repo.get_by_normalized_phone(organization_id, norm_phone)
        if prospect and prospect.status == ProspectStatus.DO_NOT_CONTACT:
            return True
        return False

    async def get_prospect_by_phone(self, organization_id: str, phone_number: str) -> Optional[Prospect]:
        norm = normalize_phone(phone_number)
        if not norm:
            return None
        return await self.repo.get_by_normalized_phone(organization_id, norm)

    async def create_prospect(self, ctx: TenantContext, req: CreateProspectRequest) -> Prospect:
        norm_phone = normalize_phone(req.phone_number)
        if not norm_phone or len("".join(c for c in norm_phone if c.isdigit())) < 7:
            raise HTTPException(status_code=400, detail="Invalid phone number. Must contain at least 7 digits.")

        if req.email and not is_valid_email(req.email):
            raise HTTPException(status_code=400, detail=f"Invalid email address format: {req.email}")

        # Duplicate check by normalized phone within tenant
        existing = await self.repo.get_by_normalized_phone(ctx.organization_id, norm_phone)
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"A contact with phone number '{req.phone_number}' ({norm_phone}) already exists in your workspace."
            )

        # Build full name
        fn = (req.first_name or "").strip()
        ln = (req.last_name or "").strip()
        if fn and ln:
            full_name = f"{fn} {ln}"
        elif fn:
            full_name = fn
        elif ln:
            full_name = ln
        elif req.company:
            full_name = req.company.strip()
        else:
            full_name = norm_phone

        group_name = req.group_name.strip() if req.group_name and req.group_name.strip() else None

        now = datetime.now(timezone.utc)
        prospect = Prospect(
            id=f"prsp_{uuid.uuid4().hex[:12]}",
            organization_id=ctx.organization_id,
            first_name=fn or None,
            last_name=ln or None,
            full_name=full_name,
            phone_number=req.phone_number.strip(),
            normalized_phone=norm_phone,
            email=req.email.strip().lower() if req.email else None,
            alternate_phone=req.alternate_phone.strip() if req.alternate_phone else None,
            company=req.company.strip() if req.company else None,
            job_title=req.job_title.strip() if req.job_title else None,
            industry=req.industry.strip() if req.industry else None,
            website=req.website.strip() if req.website else None,
            status=req.status,
            source=req.source,
            group_name=group_name,
            tags=[t.strip() for t in req.tags if t.strip()],
            notes=req.notes.strip() if req.notes else None,
            assigned_owner=req.assigned_owner.strip() if req.assigned_owner else None,
            custom_fields=req.custom_fields or {},
            created_at=now,
            updated_at=now,
            created_by=ctx.email,
            updated_by=ctx.email
        )

        return await self.repo.save(prospect)

    async def get_prospect(self, ctx: TenantContext, prospect_id: str) -> Prospect:
        p = await self.repo.get_by_id(ctx.organization_id, prospect_id)
        if not p:
            raise HTTPException(status_code=404, detail="Prospect not found.")
        return p

    async def update_prospect(self, ctx: TenantContext, prospect_id: str, req: UpdateProspectRequest) -> Prospect:
        p = await self.repo.get_by_id(ctx.organization_id, prospect_id)
        if not p:
            raise HTTPException(status_code=404, detail="Prospect not found.")

        # If phone is changing, validate & check duplicates
        if req.phone_number is not None:
            norm_phone = normalize_phone(req.phone_number)
            if not norm_phone or len("".join(c for c in norm_phone if c.isdigit())) < 7:
                raise HTTPException(status_code=400, detail="Invalid phone number format.")
            if norm_phone != p.normalized_phone:
                existing = await self.repo.get_by_normalized_phone(ctx.organization_id, norm_phone)
                if existing and existing.id != prospect_id:
                    raise HTTPException(status_code=400, detail="Another prospect with this phone number already exists.")
                p.phone_number = req.phone_number.strip()
                p.normalized_phone = norm_phone

        if req.email is not None:
            if req.email and not is_valid_email(req.email):
                raise HTTPException(status_code=400, detail="Invalid email address format.")
            p.email = req.email.strip().lower() if req.email else None

        if req.first_name is not None:
            p.first_name = req.first_name.strip() if req.first_name else None
        if req.last_name is not None:
            p.last_name = req.last_name.strip() if req.last_name else None

        # Recompute full_name
        fn = p.first_name or ""
        ln = p.last_name or ""
        if fn and ln:
            p.full_name = f"{fn} {ln}"
        elif fn:
            p.full_name = fn
        elif ln:
            p.full_name = ln
        elif p.company:
            p.full_name = p.company
        else:
            p.full_name = p.normalized_phone

        if req.alternate_phone is not None:
            p.alternate_phone = req.alternate_phone.strip() if req.alternate_phone else None
        if req.company is not None:
            p.company = req.company.strip() if req.company else None
        if req.job_title is not None:
            p.job_title = req.job_title.strip() if req.job_title else None
        if req.industry is not None:
            p.industry = req.industry.strip() if req.industry else None
        if req.website is not None:
            p.website = req.website.strip() if req.website else None
        if req.status is not None:
            p.status = req.status
        if req.source is not None:
            p.source = req.source
        if req.group_name is not None:
            p.group_name = req.group_name.strip() if req.group_name and req.group_name.strip() else None
        if req.tags is not None:
            p.tags = [t.strip() for t in req.tags if t.strip()]
        if req.notes is not None:
            p.notes = req.notes.strip() if req.notes else None
        if req.assigned_owner is not None:
            p.assigned_owner = req.assigned_owner.strip() if req.assigned_owner else None
        if req.custom_fields is not None:
            # Merge or overwrite custom fields
            current = dict(p.custom_fields)
            current.update(req.custom_fields)
            p.custom_fields = current
        if req.next_follow_up_at is not None:
            p.next_follow_up_at = req.next_follow_up_at

        p.updated_at = datetime.now(timezone.utc)
        p.updated_by = ctx.email

        return await self.repo.save(p)

    async def delete_prospect(self, ctx: TenantContext, prospect_id: str) -> bool:
        p = await self.repo.get_by_id(ctx.organization_id, prospect_id)
        if not p:
            raise HTTPException(status_code=404, detail="Prospect not found.")
        return await self.repo.delete(ctx.organization_id, prospect_id)

    async def list_prospects(
        self,
        ctx: TenantContext,
        search: Optional[str] = None,
        status: Optional[str] = None,
        tag: Optional[str] = None,
        source: Optional[str] = None,
        group_name: Optional[str] = None,
        assigned_owner: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> ProspectPaginationResponse:
        page = max(1, page)
        page_size = max(1, min(page_size, 500))

        items, total_count = await self.repo.list_by_org(
            organization_id=ctx.organization_id,
            search=search,
            status=status,
            tag=tag,
            source=source,
            group_name=group_name,
            assigned_owner=assigned_owner,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order
        )

        total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1
        return ProspectPaginationResponse(
            items=[ProspectResponse.model_validate(p) for p in items],
            total=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1
        )

    # -------------------------------------------------------------
    # CSV Import & Validation Pipeline
    # -------------------------------------------------------------
    def _parse_csv_records(self, csv_content: str, column_mapping: Dict[str, str]) -> List[Tuple[int, Dict[str, Any]]]:
        """
        Parses CSV string, applies column mapping, and returns a list of (row_number, mapped_dict).
        """
        f = io.StringIO(csv_content.strip())
        # Sniff delimiter (comma, semicolon, tab)
        sample = csv_content[:2048]
        try:
            dialect = csv.Sniffer().sniff(sample)
        except Exception:
            dialect = csv.excel

        reader = csv.DictReader(f, dialect=dialect)
        parsed = []
        for idx, row in enumerate(reader, start=2):  # start=2 considering header is line 1
            if not any(row.values()):
                continue  # skip completely empty line

            mapped_data: Dict[str, Any] = {}
            custom_fields: Dict[str, Any] = {}

            for raw_col, val in row.items():
                if not raw_col:
                    continue
                clean_val = val.strip() if val else ""
                target_field = column_mapping.get(raw_col.strip(), raw_col.strip().lower().replace(" ", "_"))

                standard_fields = {
                    "first_name", "last_name", "full_name", "phone_number", "phone",
                    "email", "alternate_phone", "company", "job_title", "title",
                    "industry", "website", "status", "source", "group_name", "group", "group_id",
                    "tags", "notes", "assigned_owner"
                }

                if target_field == "phone":
                    target_field = "phone_number"
                elif target_field == "title":
                    target_field = "job_title"
                elif target_field in ("group", "group_id"):
                    target_field = "group_name"

                if target_field in standard_fields:
                    mapped_data[target_field] = clean_val
                elif clean_val:
                    custom_fields[target_field] = clean_val

            mapped_data["custom_fields"] = custom_fields
            parsed.append((idx, mapped_data))
        return parsed

    async def validate_csv(
        self,
        ctx: TenantContext,
        csv_content: str,
        column_mapping: Dict[str, str]
    ) -> CSVValidateResponse:
        if not csv_content or not csv_content.strip():
            raise HTTPException(status_code=400, detail="CSV file is empty.")

        parsed_rows = self._parse_csv_records(csv_content, column_mapping)
        if not parsed_rows:
            raise HTTPException(status_code=400, detail="No readable data rows found in CSV.")

        # Get existing prospect phone numbers in tenant for fast in-memory duplicate check
        existing_prospects, _ = await self.repo.list_by_org(ctx.organization_id, page=1, page_size=10000)
        existing_phones = {p.normalized_phone for p in existing_prospects if p.normalized_phone}

        seen_in_file_phones = set()
        row_details: List[CSVValidateRowDetail] = []
        all_errors: List[Dict[str, Any]] = []

        valid_count = 0
        invalid_count = 0
        duplicate_count = 0

        for row_num, data in parsed_rows:
            errors = []
            is_dup = False
            dup_type = None

            raw_phone = data.get("phone_number")
            norm_phone = normalize_phone(raw_phone)

            # 1. Check phone presence and format
            if not norm_phone or len("".join(c for c in norm_phone if c.isdigit())) < 7:
                errors.append("Missing or invalid phone number (minimum 7 digits required).")

            # 2. Check email format if provided
            email_val = data.get("email")
            if email_val and not is_valid_email(email_val):
                errors.append(f"Invalid email address: '{email_val}'.")

            # 3. Check duplicate in file
            if norm_phone:
                if norm_phone in seen_in_file_phones:
                    is_dup = True
                    dup_type = "file_duplicate"
                    errors.append(f"Duplicate phone '{norm_phone}' appears multiple times in this CSV file.")
                else:
                    seen_in_file_phones.add(norm_phone)

                # 4. Check duplicate against existing DB
                if norm_phone in existing_phones:
                    is_dup = True
                    dup_type = "database_duplicate"

            is_valid = len(errors) == 0

            if is_dup:
                duplicate_count += 1
            if is_valid:
                valid_count += 1
            else:
                invalid_count += 1
                all_errors.append({
                    "row": row_num,
                    "phone": raw_phone or "",
                    "errors": errors
                })

            row_details.append(CSVValidateRowDetail(
                row_number=row_num,
                is_valid=is_valid,
                errors=errors,
                is_duplicate=is_dup,
                duplicate_type=dup_type,
                data=data
            ))

        return CSVValidateResponse(
            total_rows=len(parsed_rows),
            valid_count=valid_count,
            invalid_count=invalid_count,
            duplicate_count=duplicate_count,
            sample_rows=row_details[:20],  # Return first 20 for preview
            all_errors=all_errors[:50]
        )

    async def import_csv(
        self,
        ctx: TenantContext,
        csv_content: str,
        column_mapping: Dict[str, str],
        duplicate_policy: str = "skip",  # "skip" | "update"
        default_group_name: Optional[str] = None,
        default_tags: Optional[List[str]] = None,
        default_source: str = "CSV Import"
    ) -> CSVImportSummaryResponse:
        if not csv_content or not csv_content.strip():
            raise HTTPException(status_code=400, detail="CSV file is empty.")

        parsed_rows = self._parse_csv_records(csv_content, column_mapping)
        if not parsed_rows:
            raise HTTPException(status_code=400, detail="No readable data rows found in CSV.")

        # Load existing prospects to dictionary keyed by normalized_phone
        existing_prospects, _ = await self.repo.list_by_org(ctx.organization_id, page=1, page_size=10000)
        existing_by_phone = {p.normalized_phone: p for p in existing_prospects if p.normalized_phone}

        seen_in_batch_phones = set()
        prospects_to_save: List[Prospect] = []
        errors: List[Dict[str, Any]] = []

        imported_count = 0
        updated_count = 0
        skipped_count = 0
        invalid_count = 0

        now = datetime.now(timezone.utc)
        tag_list = [t.strip() for t in (default_tags or []) if t.strip()]
        clean_default_group = default_group_name.strip() if default_group_name and default_group_name.strip() else None

        for row_num, data in parsed_rows:
            raw_phone = data.get("phone_number")
            norm_phone = normalize_phone(raw_phone)

            # Validate phone
            if not norm_phone or len("".join(c for c in norm_phone if c.isdigit())) < 7:
                invalid_count += 1
                errors.append({
                    "row": row_num,
                    "phone": raw_phone or "",
                    "reason": "Missing or invalid phone number."
                })
                continue

            # Validate email
            email_val = data.get("email")
            if email_val and not is_valid_email(email_val):
                invalid_count += 1
                errors.append({
                    "row": row_num,
                    "phone": raw_phone or "",
                    "reason": f"Invalid email format: '{email_val}'."
                })
                continue

            # Check duplicate in batch
            if norm_phone in seen_in_batch_phones:
                if duplicate_policy == "skip":
                    skipped_count += 1
                    continue
            seen_in_batch_phones.add(norm_phone)

            # Determine Name
            fn = data.get("first_name") or ""
            ln = data.get("last_name") or ""
            raw_full = data.get("full_name") or ""

            if raw_full and not fn and not ln:
                parts = raw_full.strip().split(" ", 1)
                fn = parts[0]
                ln = parts[1] if len(parts) > 1 else ""

            if fn and ln:
                full_name = f"{fn} {ln}"
            elif fn:
                full_name = fn
            elif ln:
                full_name = ln
            elif data.get("company"):
                full_name = data["company"].strip()
            else:
                full_name = norm_phone

            # Group Name determination
            row_group = (data.get("group_name") or clean_default_group or "").strip() or None

            # Status parsing
            raw_status = data.get("status")
            status = ProspectStatus.NEW
            if raw_status:
                for s in ProspectStatus:
                    if s.value.lower() == raw_status.strip().lower() or s.name.lower() == raw_status.strip().lower():
                        status = s
                        break

            # Tags merging
            row_tags = list(tag_list)
            if data.get("tags"):
                for t in str(data["tags"]).split(","):
                    clean_t = t.strip()
                    if clean_t and clean_t not in row_tags:
                        row_tags.append(clean_t)

            # Check against existing DB
            existing = existing_by_phone.get(norm_phone)
            if existing:
                if duplicate_policy == "skip":
                    skipped_count += 1
                    continue
                elif duplicate_policy == "update":
                    # Update fields that are provided
                    if fn:
                        existing.first_name = fn
                    if ln:
                        existing.last_name = ln
                    existing.full_name = full_name
                    if email_val:
                        existing.email = email_val.strip().lower()
                    if data.get("company"):
                        existing.company = data["company"].strip()
                    if data.get("job_title"):
                        existing.job_title = data["job_title"].strip()
                    if data.get("industry"):
                        existing.industry = data["industry"].strip()
                    if data.get("website"):
                        existing.website = data["website"].strip()
                    if row_group:
                        existing.group_name = row_group
                    if data.get("notes"):
                        existing.notes = data["notes"].strip()
                    for t in row_tags:
                        if t not in existing.tags:
                            existing.tags.append(t)
                    if data.get("custom_fields"):
                        existing.custom_fields.update(data["custom_fields"])
                    existing.updated_at = now
                    existing.updated_by = ctx.email

                    prospects_to_save.append(existing)
                    updated_count += 1
                    continue

            # Create brand new prospect
            new_p = Prospect(
                id=f"prsp_{uuid.uuid4().hex[:12]}",
                organization_id=ctx.organization_id,
                first_name=fn or None,
                last_name=ln or None,
                full_name=full_name,
                phone_number=raw_phone.strip(),
                normalized_phone=norm_phone,
                email=email_val.strip().lower() if email_val else None,
                alternate_phone=data.get("alternate_phone") or None,
                company=data.get("company") or None,
                job_title=data.get("job_title") or None,
                industry=data.get("industry") or None,
                website=data.get("website") or None,
                status=status,
                source=ProspectSource.CSV_IMPORT if default_source == "CSV Import" else ProspectSource.MANUAL,
                group_name=row_group,
                tags=row_tags,
                notes=data.get("notes") or None,
                assigned_owner=data.get("assigned_owner") or None,
                custom_fields=data.get("custom_fields") or {},
                created_at=now,
                updated_at=now,
                created_by=ctx.email,
                updated_by=ctx.email
            )
            prospects_to_save.append(new_p)
            imported_count += 1

        # Bulk save
        if prospects_to_save:
            await self.repo.save_bulk(prospects_to_save)

        return CSVImportSummaryResponse(
            total_rows=len(parsed_rows),
            imported_count=imported_count,
            updated_count=updated_count,
            skipped_count=skipped_count,
            invalid_count=invalid_count,
            errors=errors
        )

    # -------------------------------------------------------------
    # Bulk Operations
    # -------------------------------------------------------------
    async def bulk_update_status(self, ctx: TenantContext, prospect_ids: List[str], status: ProspectStatus) -> int:
        if not prospect_ids:
            return 0
        return await self.repo.bulk_update_status(ctx.organization_id, prospect_ids, status, updated_by=ctx.email)

    async def bulk_update_tags(
        self,
        ctx: TenantContext,
        prospect_ids: List[str],
        tags: List[str],
        action: str = "add"
    ) -> int:
        if not prospect_ids or not tags:
            return 0
        return await self.repo.bulk_update_tags(ctx.organization_id, prospect_ids, tags, action=action, updated_by=ctx.email)

    async def bulk_update_group(
        self,
        ctx: TenantContext,
        prospect_ids: List[str],
        group_name: Optional[str] = None
    ) -> int:
        if not prospect_ids:
            return 0
        return await self.repo.bulk_update_group(ctx.organization_id, prospect_ids, group_name, updated_by=ctx.email)

    async def list_distinct_groups(self, ctx: TenantContext) -> List[str]:
        return await self.repo.list_distinct_groups(ctx.organization_id)

    async def bulk_delete(self, ctx: TenantContext, prospect_ids: List[str]) -> int:
        if not prospect_ids:
            return 0
        return await self.repo.bulk_delete(ctx.organization_id, prospect_ids)

    async def add_tag(self, ctx: TenantContext, prospect_id: str, tag: str) -> Prospect:
        p = await self.get_prospect(ctx, prospect_id)
        clean = tag.strip()
        if clean and clean not in p.tags:
            p.tags.append(clean)
            p.updated_at = datetime.now(timezone.utc)
            p.updated_by = ctx.email
            await self.repo.save(p)
        return p

    async def remove_tag(self, ctx: TenantContext, prospect_id: str, tag: str) -> Prospect:
        p = await self.get_prospect(ctx, prospect_id)
        clean = tag.strip()
        if clean in p.tags:
            p.tags = [t for t in p.tags if t != clean]
            p.updated_at = datetime.now(timezone.utc)
            p.updated_by = ctx.email
            await self.repo.save(p)
        return p

    # -------------------------------------------------------------
    # Call History & Activity Aggregation
    # -------------------------------------------------------------
    async def get_prospect_calls(self, ctx: TenantContext, prospect_id: str) -> List[Dict[str, Any]]:
        p = await self.get_prospect(ctx, prospect_id)
        all_calls = await self.call_repo.list_by_org(ctx.organization_id)

        # Match by prospect_id or to_number == prospect.phone_number or prospect.normalized_phone
        matched = []
        for c in all_calls:
            call_norm = normalize_phone(c.to_number)
            if (hasattr(c, "prospect_id") and getattr(c, "prospect_id") == prospect_id) or \
               (c.to_number == p.phone_number) or \
               (call_norm and call_norm == p.normalized_phone):
                matched.append(c.model_dump(mode="json"))

        return matched

    async def record_call_outcome(
        self,
        organization_id: str,
        phone_number: str,
        call_id: str,
        duration: int,
        outcome: Optional[str] = None,
        is_success: bool = True
    ):
        norm = normalize_phone(phone_number)
        if not norm:
            return
        p = await self.repo.get_by_normalized_phone(organization_id, norm)
        if p:
            p.total_calls += 1
            if is_success:
                p.successful_calls += 1
                if p.status == ProspectStatus.NEW:
                    p.status = ProspectStatus.CONTACTED
            else:
                p.failed_calls += 1

            p.last_contacted_at = datetime.now(timezone.utc)
            p.last_call_id = call_id
            p.last_call_outcome = outcome
            p.updated_at = datetime.now(timezone.utc)
            await self.repo.save(p)
