# routes/talent/talentRoute.py
# Add this router to main.py:  app.include_router(talentRoute.router)

from fastapi import APIRouter, HTTPException
from db import client
from utils.serializer import serialize_doc
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
db = client["immersia"]

certificates_collection  = db["certificates"]
users_collection         = db["users"]          # adjust if your collection name differs
user_projects_collection = db["user_projects"]


# ============================================================================
# GET /api/talent
# Returns every user who has at least one issued certificate.
# Public endpoint — no auth required (talent pool is publicly visible).
# ============================================================================
@router.get("/api/talent")
async def get_certified_talent():
    try:
        # 1. Fetch all certificates grouped by user
        all_certs = list(certificates_collection.find())

        # 2. Group certificates by user_id
        cert_map: dict[str, list] = {}
        for cert in all_certs:
            uid = cert.get("user_id", "")
            if not uid:
                continue
            if uid not in cert_map:
                cert_map[uid] = []
            cert_map[uid].append({
                "certificate_id": cert.get("certificate_id", ""),
                "project_title":  cert.get("project_title", ""),
                "category":       cert.get("category", ""),
                "technologies":   cert.get("technologies", []),
                "quiz_score":     cert.get("quiz_score", 0),
                "issued_at":      cert.get("issued_at", "").isoformat()
                                  if hasattr(cert.get("issued_at", ""), "isoformat") else str(cert.get("issued_at", "")),
            })

        if not cert_map:
            return {"talent": []}

        # 3. Fetch user profiles for certified users
        talent_list = []
        for user_id, certs in cert_map.items():
            user_doc = None
            try:
                user_doc = users_collection.find_one({"_id": ObjectId(user_id)})
            except Exception:
                # user_id might be stored as string, not ObjectId
                user_doc = users_collection.find_one({"_id": user_id})

            if not user_doc:
                # Still include the user with minimal info if profile not found
                talent_list.append({
                    "user_id":        user_id,
                    "name":           "Anonymous",
                    "email":          "",
                    "title":          "",
                    "bio":            "",
                    "skills":         [],
                    "location":       "",
                    "certifications": certs,
                    "cert_count":     len(certs),
                })
                continue

            # Collect all unique skills from their certified projects
            all_skills = set()
            for cert in certs:
                for tech in cert.get("technologies", []):
                    all_skills.add(tech)

            talent_list.append({
                "user_id":        user_id,
                "name":           user_doc.get("name") or user_doc.get("full_name") or user_doc.get("username") or "Anonymous",
                "email":          user_doc.get("email", ""),
                "title":          user_doc.get("title") or user_doc.get("role") or _infer_title(list(all_skills)),
                "bio":            user_doc.get("bio") or f"Certified professional with {len(certs)} verified project{'s' if len(certs) > 1 else ''}.",
                "skills":         list(all_skills),
                "location":       user_doc.get("location", ""),
                "phone":          user_doc.get("phone", ""),
                "availability":   user_doc.get("availability", "Open to opportunities"),
                "expected_salary":user_doc.get("expected_salary", ""),
                "education":      user_doc.get("education", ""),
                "experience":     user_doc.get("experience", []),
                "certifications": certs,
                "cert_count":     len(certs),
                "is_verified":    True,  # they earned at least one certificate
            })

        # Sort by most certificates first
        talent_list.sort(key=lambda x: x["cert_count"], reverse=True)
        return {"talent": talent_list}

    except Exception as e:
        logger.error(f"get_certified_talent error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================================
# GET /api/talent/{user_id}
# Full profile — only accessible to HR users (enforced on frontend via is_hr).
# ============================================================================
@router.get("/api/talent/{user_id}")
async def get_talent_profile(user_id: str):
    try:
        # Fetch all certificates for this user
        certs = list(certificates_collection.find({"user_id": user_id}))
        if not certs:
            raise HTTPException(status_code=404, detail="Talent not found or has no certificates")

        # Fetch user profile
        user_doc = None
        try:
            user_doc = users_collection.find_one({"_id": ObjectId(user_id)})
        except Exception:
            user_doc = users_collection.find_one({"_id": user_id})

        all_skills = set()
        serialized_certs = []
        for cert in certs:
            for tech in cert.get("technologies", []):
                all_skills.add(tech)
            serialized_certs.append({
                "certificate_id": cert.get("certificate_id", ""),
                "project_title":  cert.get("project_title", ""),
                "category":       cert.get("category", ""),
                "technologies":   cert.get("technologies", []),
                "quiz_score":     cert.get("quiz_score", 0),
                "issued_at":      cert.get("issued_at", "").isoformat()
                                  if hasattr(cert.get("issued_at", ""), "isoformat") else str(cert.get("issued_at", "")),
            })

        name = "Anonymous"
        email = ""
        title = ""
        bio = ""
        location = ""
        phone = ""
        availability = "Open to opportunities"
        expected_salary = ""
        education = ""
        experience = []

        if user_doc:
            name         = user_doc.get("name") or user_doc.get("full_name") or user_doc.get("username") or "Anonymous"
            email        = user_doc.get("email", "")
            title        = user_doc.get("title") or user_doc.get("role") or _infer_title(list(all_skills))
            bio          = user_doc.get("bio") or f"Certified professional with {len(certs)} verified project{'s' if len(certs) > 1 else ''}."
            location     = user_doc.get("location", "")
            phone        = user_doc.get("phone", "")
            availability = user_doc.get("availability", "Open to opportunities")
            expected_salary = user_doc.get("expected_salary", "")
            education    = user_doc.get("education", "")
            experience   = user_doc.get("experience", [])

        return {
            "user_id":         user_id,
            "name":            name,
            "email":           email,
            "title":           title or _infer_title(list(all_skills)),
            "bio":             bio,
            "skills":          list(all_skills),
            "location":        location,
            "phone":           phone,
            "availability":    availability,
            "expected_salary": expected_salary,
            "education":       education,
            "experience":      experience,
            "certifications":  serialized_certs,
            "cert_count":      len(serialized_certs),
            "is_verified":     True,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_talent_profile error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


def _infer_title(skills: list[str]) -> str:
    """Infer a job title from the tech stack."""
    skills_lower = [s.lower() for s in skills]
    if any(s in skills_lower for s in ["tensorflow", "pytorch", "scikit-learn", "pandas", "machine learning"]):
        return "Machine Learning Engineer"
    if any(s in skills_lower for s in ["react", "vue", "angular", "next.js", "frontend"]):
        if any(s in skills_lower for s in ["node.js", "django", "fastapi", "express", "backend"]):
            return "Full Stack Developer"
        return "Frontend Developer"
    if any(s in skills_lower for s in ["node.js", "django", "fastapi", "flask", "express"]):
        return "Backend Developer"
    if any(s in skills_lower for s in ["aws", "azure", "gcp", "docker", "kubernetes"]):
        return "Cloud / DevOps Engineer"
    if any(s in skills_lower for s in ["figma", "ux", "ui", "design"]):
        return "UX/UI Designer"
    if any(s in skills_lower for s in ["python", "sql", "data"]):
        return "Data Scientist"
    return "Software Developer"