from passlib.context import CryptContext
from db import client
import os
from dotenv import load_dotenv

load_dotenv()

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

def hash_password(pwd: str):
    return pwd_context.hash(pwd)


def ensure_seed_accounts():
    db = client["immersia"]
    users = db["users"]
    role_emails = db["role_emails"]

    # Load passwords from environment variables (REQUIRED - no defaults)
    admin_pwd = os.getenv("ADMIN_PASSWORD")
    hr_pwd = os.getenv("HR_PASSWORD")
    mentor_pwd = os.getenv("MENTOR_PASSWORD")

    # Validate that all passwords are provided
    if not admin_pwd or not hr_pwd or not mentor_pwd:
        raise ValueError(
            "❌ Missing required environment variables!\n"
            "Please set these in Backend/.env:\n"
            "  - ADMIN_PASSWORD\n"
            "  - HR_PASSWORD\n"
            "  - MENTOR_PASSWORD\n"
            "See .env.example for template."
        )

    accounts = [
        {
            "email": "admin@immersia.com",
            "password": admin_pwd,
            "role": "admin",
            "name": "Admin User",
        },
        {
            "email": "hr@immersia.com",
            "password": hr_pwd,
            "role": "hr",
            "name": "HR User",
        },
        {
            "email": "mentor@immersia.com",
            "password": mentor_pwd,
            "role": "mentor",
            "name": "Mentor User",
        },
    ]

    for acct in accounts:
        existing = users.find_one({"email": acct["email"]})
        hashed = hash_password(acct["password"])
        if existing:
            # Update role and password (rotate on change)
            users.update_one({"email": acct["email"]}, {"$set": {"password": hashed, "role": acct["role"], "name": acct.get("name")}})
        else:
            users.insert_one({"email": acct["email"], "password": hashed, "role": acct["role"], "name": acct.get("name")})

        # Ensure role_emails has verified entry so role resolution works
        re = role_emails.find_one({"email": acct["email"]})
        if re:
            role_emails.update_one({"email": acct["email"]}, {"$set": {"role": acct["role"], "is_verified": True}})
        else:
            role_emails.insert_one({"email": acct["email"], "role": acct["role"], "is_verified": True})
