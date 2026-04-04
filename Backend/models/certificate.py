from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class Certificate(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    project_id: str
    project_title: str
    category: Optional[str] = None
    technologies: List[str] = []
    quiz_score: int  # percentage (0-100)
    issued_at: Optional[datetime] = None
    certificate_id: str  # Unique certificate ID (e.g., IMMERSIA-ABC123-DEF456)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        extra = "allow"


class Submission(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    project_id: str
    description: str
    github_url: str
    live_demo_url: str
    challenges: str
    learnings: str
    status: str = "pending"  # pending, approved, rejected
    mentor_feedback: Optional[str] = None
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        extra = "allow"


class ProjectProgress(BaseModel):
    """Tracks a user's progress on a project"""
    user_id: str
    project_id: str
    project_title: str
    status: str = "pending"  # pending, in-progress, submitted, approved, completed
    started_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    submission_id: Optional[str] = None
    certificate_id: Optional[str] = None
    quiz_attempts: int = 0
    best_quiz_score: Optional[int] = None  # highest quiz score
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        extra = "allow"
