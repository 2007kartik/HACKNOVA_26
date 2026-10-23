"""
Members endpoints — owner name to Trello/GitHub mapping.

GET    /members           list all members
POST   /members           create member
PUT    /members/{id}      update member
DELETE /members/{id}      delete member
"""
import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Member
from ..schemas import MemberOut, MemberCreateRequest, MemberUpdateRequest
from ..errors import NotFoundError, ValidationError

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_member_or_404(member_id: str, db: Session) -> Member:
    member = db.get(Member, member_id)
    if not member:
        raise NotFoundError(f"Member '{member_id}' not found.")
    return member


def _to_out(m: Member) -> MemberOut:
    return MemberOut(
        id=m.id,
        name=m.name,
        email=m.email,
        trello_member_id=m.trello_member_id,
        github_login=m.github_login,
    )


@router.get("/members", response_model=list[MemberOut])
def list_members(db: Session = Depends(get_db)):
    """List all members ordered by name."""
    members = db.query(Member).order_by(Member.name.asc()).all()
    return [_to_out(m) for m in members]


@router.post("/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def create_member(body: MemberCreateRequest, db: Session = Depends(get_db)):
    """
    Create a new member.
    The name must be unique — it is used to match item owners to Trello IDs.
    """
    # Check for duplicate name
    existing = db.query(Member).filter(Member.name == body.name).first()
    if existing:
        raise ValidationError(
            f"A member named '{body.name}' already exists.",
            details={"name": body.name, "existing_id": existing.id},
        )

    member = Member(
        name=body.name,
        email=body.email,
        trello_member_id=body.trello_member_id,
        github_login=body.github_login,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    logger.info("Created member '%s' (id=%s)", member.name, member.id)
    return _to_out(member)


@router.put("/members/{member_id}", response_model=MemberOut)
def update_member(
    member_id: str,
    body: MemberUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update member fields. All fields are optional."""
    member = _get_member_or_404(member_id, db)

    if body.name is not None and body.name != member.name:
        # Check for name conflict
        existing = db.query(Member).filter(
            Member.name == body.name,
            Member.id != member_id,
        ).first()
        if existing:
            raise ValidationError(
                f"A member named '{body.name}' already exists.",
                details={"name": body.name},
            )
        member.name = body.name

    if body.email is not None:
        member.email = body.email
    if body.trello_member_id is not None:
        member.trello_member_id = body.trello_member_id
    if body.github_login is not None:
        member.github_login = body.github_login

    db.commit()
    db.refresh(member)
    logger.info("Updated member '%s' (id=%s)", member.name, member.id)
    return _to_out(member)


@router.delete("/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member(member_id: str, db: Session = Depends(get_db)):
    """Delete a member. Does not affect items that reference this member by name."""
    member = _get_member_or_404(member_id, db)
    db.delete(member)
    db.commit()
    logger.info("Deleted member id=%s", member_id)
