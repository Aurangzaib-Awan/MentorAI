from fastapi import HTTPException, APIRouter, Request, Response
from passlib.context import CryptContext
import logging
from fastapi import HTTPException
from con import client
from models.login_model import Login_Model


router = APIRouter()

db = client["immersia"]
users_collection = db["users"]
role_emails_collection = db["role_emails"]

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
logger = logging.getLogger("auth")


def verify_pwd(plain_pwd, hashed):
    try:
        if not hashed:
            return False
        return pwd_context.verify(plain_pwd, hashed)
    except Exception:
        # Any error verifying password should be treated as verification failure
        logger.exception("password verification error")
        return False

# Initialize role emails collection with sample data
async def initialize_role_emails():
    # Check if collection is empty, then insert sample data
    if role_emails_collection.count_documents({}) == 0:
        sample_roles = [
            # Admin emails
            {"email": "admin@immersia.com", "role": "admin", "is_verified": True},
            
            # HR emails (verified)
            {"email": "hr@immersia.com", "role": "hr", "is_verified": True},
            
            # Mentor emails (verified)
            {"email": "mentor@immersia.com", "role": "mentor", "is_verified": True},
            
            # Pending verification HR emails
            {"email": "newhr@company.com", "role": "hr", "is_verified": False},
        ]
        role_emails_collection.insert_many(sample_roles)

@router.post("/login")
async def login(request: Request, response: Response, user: Login_Model):
    try:
        # Initialize role emails if collection is empty
        await initialize_role_emails()
        
        temp_user = users_collection.find_one({"email": user.email})

        if not temp_user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not verify_pwd(user.password, temp_user.get("password")):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Check role from role_emails collection
        role_data = role_emails_collection.find_one({
            "email": user.email,
            "is_verified": True  # Only consider verified role emails
        })
        
        if role_data:
            # User has a special role (admin, hr, mentor)
            role = role_data["role"]
        else:
            # Regular user - check existing role or default to "student"
            role = temp_user.get("role", "student")
        
        # Update user role in users collection to keep it consistent
        users_collection.update_one(
            {"email": user.email},
            {"$set": {"role": role}}
        )
        
        # Create token with role information
        token_payload = {
            "email": user.email, 
            "role": role,
            "is_admin": role == "admin",
            "is_hr": role == "hr",
            "is_mentor": role == "mentor"
        }
        
        # Create server-managed session (cookie-based)
        sm = request.state.session_manager
        session = sm.create_session(request, user.email, role)

        # Set secure cookie (HttpOnly, Secure, SameSite=Strict)
        cookie_name = sm.cookie_name
        max_age = int(sm.idle_timeout.total_seconds())
        response.set_cookie(cookie_name, session["_id"], httponly=True, secure=sm.cookie_secure, samesite="Strict", path='/', max_age=max_age)

        return {
            "user": {
                "fullname": temp_user.get("fullname", ""),
                "email": user.email,
                "role": role,
                "is_admin": role == "admin",
                "is_hr": role == "hr",
                "is_mentor": role == "mentor"
            }
        }
        
    except HTTPException:
        # Re-raise intentional HTTP errors to be handled by FastAPI
        raise
    except Exception as e:
        logger.exception("Unexpected error during login")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/logout")
async def logout(request: Request, response: Response):
    try:
        sm = request.state.session_manager
        cookie_name = sm.cookie_name
        sid = request.cookies.get(cookie_name)
        if sid:
            sm.destroy_session(sid)
        response.delete_cookie(cookie_name, path='/', secure=sm.cookie_secure, samesite="Strict")
        return {"detail": "logged out"}
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/session/csrf")
async def get_csrf(request: Request):
    # Return the CSRF token tied to the session (if any)
    sm = request.state.session_manager
    sid = request.cookies.get(sm.cookie_name)
    if not sid:
        raise HTTPException(status_code=401, detail="Authentication required")
    s = sm.get_session(sid)
    if not s:
        raise HTTPException(status_code=401, detail="Authentication required")
    # Safe to return only the csrf token (not session id)
    return {"csrf_token": s.get("csrf_token")}


@router.get("/me")
async def me(request: Request):
    s = getattr(request.state, "session", None)
    if not s:
        raise HTTPException(status_code=401, detail="Authentication required")
    return {"email": s.get("email"), "role": s.get("role")}