from fastapi import APIRouter, HTTPException
from db import client
from models.projects import Project, UserProject, ProjectQuiz, QuizQuestion
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from bson import ObjectId
import os
from dotenv import load_dotenv
import logging
from utils.serializer import serialize_doc
import subprocess, sys
import re, json
import random

logger = logging.getLogger(__name__)
load_dotenv()

GeminiClient = None
try:
    import google.generativeai as genai
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
        GeminiClient = genai
        logger.info("Google Generative AI configured successfully")
except ImportError:
    try:
        logger.warning("google-generativeai not found, installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "google-generativeai"])
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
            GeminiClient = genai
    except Exception as install_exc:
        logger.error(f"Failed to install google-generativeai: {install_exc}")
        GeminiClient = None


router = APIRouter()
db = client["immersia"]
project_collection      = db["projects"]        # curated projects (Project schema)
user_projects_collection = db["user_projects"]  # AI-generated per-user projects
project_quizzes_collection = db["project_quizzes"]


class QuizSubmission(BaseModel):
    quiz_id: str
    user_id: str
    user_answers: List[dict]

class GenerateQuizRequest(BaseModel):
    project_id: str
    user_id: str

class GenerateProjectRequest(BaseModel):
    user_id: str
    skills: List[str]
    difficulty: Optional[str] = None


# ============================================================================
# GEMINI HELPER
# ============================================================================
def call_gemini_json(prompt_text: str) -> Optional[str]:
    try:
        model = GeminiClient.GenerativeModel('gemini-2.0-flash')
        resp = model.generate_content(prompt_text)
        text = resp.text if hasattr(resp, 'text') else str(resp)
        if not text:
            return None
        text = text.strip()
        text = re.sub(r"^```json\s*", "", text, flags=re.IGNORECASE).strip()
        text = re.sub(r"^```\s*",     "", text, flags=re.IGNORECASE).strip()
        text = re.sub(r"\s*```$",     "", text, flags=re.IGNORECASE).strip()
        m = re.search(r"\{.*\}", text, re.DOTALL)
        return m.group(0) if m else text
    except Exception as e:
        logger.warning(f"Gemini call error: {e}")
        return None


# ============================================================================
# PROJECT GENERATION
# ============================================================================

# Real-world app domains used to seed Gemini's imagination.
# We pick one randomly so every generation feels fresh.
APP_DOMAINS = [
    "a SaaS productivity tool",
    "a marketplace platform",
    "a social networking app",
    "a real-time collaboration tool",
    "a dashboard and analytics platform",
    "a booking and scheduling system",
    "an e-commerce storefront",
    "a task and project management app",
    "a food delivery or restaurant ordering system",
    "a job board and recruitment platform",
    "a learning management system (LMS)",
    "a personal finance tracker",
    "a health and fitness tracking app",
    "a real estate listing platform",
    "a news aggregator and reader",
    "a customer support ticketing system",
    "an inventory management system",
    "a ride-sharing or logistics tracker",
    "a subscription billing platform",
    "a social media content scheduler",
    "a URL shortener with analytics",
    "an event management and ticketing platform",
    "a blogging and content publishing platform",
    "a chatbot-powered customer service tool",
    "a code snippet sharing platform",
    "a weather dashboard with alerts",
    "a quiz and assessment platform",
    "a hotel or accommodation booking app",
    "a gym membership management system",
    "a document collaboration and version control tool",
]


@router.post("/api/generate-project")
async def generate_project(request: GenerateProjectRequest):
    """
    Generate a real-world project idea using Gemini.
    Stores in BOTH:
      - user_projects  (tracks per-user progress, quiz linking)
      - projects       (curated marketplace — Project schema)
    """
    global GeminiClient
    if GeminiClient is None:
        raise HTTPException(status_code=500, detail="google-generativeai not configured")
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    difficulty  = request.difficulty or "Intermediate"
    skills_str  = ", ".join(request.skills)

    # Pick a random real-world domain to anchor the project idea
    domain = random.choice(APP_DOMAINS)

    # =========================================================================
    # MASTER PROMPT — TWO-PHASE THINKING
    #
    # Phase 1 (hidden from user): Gemini invents a SPECIFIC real-world app idea
    #          anchored to the domain, not just "use technology X".
    # Phase 2: Gemini fills in all the structured fields for that app idea.
    #
    # This prevents Gemini from outputting "make a Python app" style projects.
    # =========================================================================
    master_prompt = f"""You are a senior software engineer and technical mentor at a top bootcamp.

A student wants a hands-on portfolio project. Their skills: {skills_str}. Difficulty: {difficulty}.

STEP 1 — INVENT A SPECIFIC APP (do this mentally before writing JSON):
Think of a concrete, named real-world application in the domain of: {domain}
The app must:
- Have a specific name (e.g. "ShiftMate — Employee Shift Scheduler" not just "scheduling app")
- Solve a clear, relatable problem that real users actually face
- Be completely buildable using: {skills_str}
- Be scoped appropriately for {difficulty} level (not too simple, not impossible)

Examples of GOOD specific app ideas:
- "SplitEase — A bill-splitting app for roommates that tracks shared expenses and sends payment reminders"
- "HireFlow — A job application tracker where candidates log interviews, follow-ups, and offer statuses"
- "MenuMate — A restaurant menu builder where owners create digital menus with QR code generation"
- "GrowthLog — A plant care tracker that reminds users when to water, fertilize, and repot their plants"

Examples of BAD generic ideas (NEVER do this):
- "A Python web application" ❌
- "A React project" ❌
- "A web app using MongoDB" ❌
- "A CRUD application" ❌

STEP 2 — RETURN JSON for the specific app you invented in Step 1.

RETURN ONLY valid JSON. No markdown fences. No explanation. Start with {{ end with }}

{{
  "title": "AppName — One-line description of what it does (e.g. ShiftMate — Employee Shift Scheduler)",

  "description": "2-3 sentences explaining the real-world problem this app solves, who uses it, and what makes it valuable. Write as if pitching to a user, not describing a coding exercise.",

  "category": "Exactly one of: Web Development | Mobile Development | Data Science | Machine Learning | Cloud Computing | DevOps | Cyber Security | Artificial Intelligence | Blockchain | Game Development",

  "difficulty": "{difficulty}",

  "duration": "Exactly one of: 1 week | 2 weeks | 3 weeks | 1 month | 2 months | 3 months | 6 months",

  "technologies": ["List actual library/framework names used to build THIS app", "Must include: {skills_str}", "Add supporting tools naturally needed (e.g. JWT, bcrypt, Axios, etc)", "4 to 8 items"],

  "prerequisites": [
    "Specific skill the student needs before starting",
    "Another prerequisite directly relevant to {skills_str}",
    "Third prerequisite — minimum 3, maximum 5"
  ],

  "project_description": "## What You're Building\\nDescribe the specific app in 3-4 sentences. Name real features, real user roles, real workflows.\\n\\n## Core Features\\n- **Feature 1**: What it does and why users need it (be specific)\\n- **Feature 2**: What it does and why users need it\\n- **Feature 3**: What it does and why users need it\\n- **Feature 4**: What it does and why users need it\\n- **Feature 5**: What it does and why users need it\\n\\n## Technical Architecture\\n- **Frontend**: What framework/library and how it's used in this app\\n- **Backend**: What framework and what the API does\\n- **Database**: What DB and what data it stores for this app\\n- **Auth**: How users log in and what roles exist\\n\\n## What You'll Build Step by Step\\n1. Project setup and dependency installation\\n2. Database schema and models for this app's data\\n3. Authentication — how users register and log in\\n4. [Primary feature] — specific to this app\\n5. [Secondary feature] — specific to this app\\n6. Frontend UI and connecting to the API\\n7. Validation, error handling, and edge cases\\n8. Tests for critical functionality\\n9. Deployment and environment configuration\\n10. Documentation and final polish\\n\\n## Who This Is For\\nDescribe the real end-user of this app — not 'students learning to code'.",

  "tasks": [
    "Initialize the project: create repo, set up {skills_str} project structure, install all dependencies including [list specific packages for THIS app]",
    "Design the database schema: define the [specific collections/tables for THIS app's data] with all required fields and relationships",
    "Build user authentication: registration, login, password hashing with bcrypt, JWT token issuance and validation, protected route middleware",
    "Implement [primary feature name]: [specific description of what to build for THIS app — not generic]",
    "Implement [secondary feature name]: [specific description of what to build for THIS app]",
    "Implement [third feature name]: [specific description of what to build for THIS app]",
    "Build the frontend: [describe the specific pages/screens and UI components needed for THIS app]",
    "Add input validation, API error responses, and handle all edge cases for [specific scenarios in THIS app]",
    "Write tests: unit tests for [specific functions] and integration tests for [specific API endpoints in THIS app]",
    "Deploy to [appropriate cloud platform] with environment variables, configure CI/CD, and write README with setup guide and screenshots"
  ],

  "learning_outcomes": "After completing this project you will:\\n- Know how to build [specific thing] using {skills_str}\\n- Understand [specific architectural pattern used in this app]\\n- Be able to implement [specific technical challenge in this app]\\n- Have a deployed, working app to show in your portfolio\\n- Understand how to test and document a production-ready application"
}}

ABSOLUTE RULES:
1. The title must name a SPECIFIC app — include the app name AND what it does
2. The description must describe a real user problem — not a coding exercise
3. Tasks 4, 5, 6, 7 must reference THIS app's specific features by name — not generic steps
4. project_description features must name real UI elements, real data, real user actions
5. technologies must be a JSON array — real package names, not categories
6. prerequisites must be a JSON array of strings
7. tasks must be a JSON array of exactly 10 strings
8. category and duration must match the exact allowed values listed above
9. NEVER write "a web application using X" — always name the specific app and its purpose"""

    generated = call_gemini_json(master_prompt)
    parsed = None

    for attempt in range(3):
        if generated is None:
            break
        try:
            parsed = json.loads(generated)
            # Must have a real title (not generic) and tasks
            if parsed.get("title") and parsed.get("tasks") and parsed.get("description"):
                break
            raise ValueError("Missing required fields")
        except Exception as e:
            logger.debug(f"Project parse attempt {attempt + 1} failed: {e}")
            if attempt < 2:
                generated = call_gemini_json(
                    "CRITICAL: Return ONLY raw JSON. No markdown. No backticks. "
                    "Start with { end with }\n\n" + master_prompt
                )

    # Structured fallback — still uses the random domain for specificity
    if parsed is None:
        logger.warning("All Gemini attempts failed — using structured fallback")
        skill0 = request.skills[0] if request.skills else "Python"
        parsed = {
            "title": f"TaskFlow — Team Task & Project Management Tool",
            "description": f"TaskFlow helps small teams organize work by creating projects, assigning tasks, tracking deadlines, and visualizing progress on a Kanban board. Built using {skills_str}, it demonstrates real-world full-stack development with team collaboration features.",
            "category": "Web Development",
            "difficulty": difficulty,
            "duration": "1 month",
            "technologies": request.skills + ["JWT", "bcrypt", "Axios"],
            "prerequisites": [
                f"Working knowledge of {skill0}",
                "Understanding of HTTP and REST APIs",
                "Basic experience with Git and version control"
            ],
            "project_description": (
                "## What You're Building\n"
                "TaskFlow is a team task management web app where users create workspaces, "
                "invite teammates, create tasks with deadlines and priorities, assign them to members, "
                "and track progress through a Kanban board with columns (To Do, In Progress, Done).\n\n"
                "## Core Features\n"
                "- **Workspace Management**: Users create named workspaces and invite members by email\n"
                "- **Task CRUD**: Create, assign, prioritize, and set due dates on tasks\n"
                "- **Kanban Board**: Drag-and-drop tasks between status columns\n"
                "- **Activity Feed**: Real-time log of who did what on each task\n"
                "- **Dashboard**: Summary view of overdue, upcoming, and completed tasks\n\n"
                "## Technical Architecture\n"
                f"- **Frontend**: {request.skills[0] if request.skills else 'React'} with component-based UI\n"
                "- **Backend**: REST API handling workspaces, tasks, users, and invitations\n"
                "- **Database**: Stores users, workspaces, tasks, assignments, and activity logs\n"
                "- **Auth**: JWT-based authentication with role-based access (admin vs member)\n\n"
                "## What You'll Build Step by Step\n"
                "1. Project setup and dependencies\n2. Database schema design\n"
                "3. Auth system\n4. Workspace and member management\n"
                "5. Task CRUD and assignment\n6. Kanban board UI\n"
                "7. Activity feed\n8. Dashboard analytics\n9. Tests\n10. Deployment\n\n"
                "## Who This Is For\nSmall teams (2–10 people) who need a lightweight alternative to Jira or Trello."
            ),
            "tasks": [
                f"Initialize project: create repo, set up {skills_str} project structure, install dependencies (JWT, bcrypt, database driver, HTTP client)",
                "Design database schema: users, workspaces, workspace_members, tasks, task_assignments, and activity_log collections/tables",
                "Build auth system: registration, login, bcrypt password hashing, JWT token generation, token refresh, and auth middleware",
                "Implement workspace management: create workspace, invite members by email, accept invitations, list workspaces for current user",
                "Implement task CRUD: create task with title, description, priority, due date; assign to member; update status; delete task",
                "Build Kanban board UI: three-column layout (To Do, In Progress, Done), drag-and-drop task cards, real-time status update on drop",
                "Build dashboard and activity feed: overdue task count, tasks due today, completed this week, and chronological activity log per workspace",
                "Add validation: required fields, date format checks, membership authorization (only workspace members can view/edit tasks)",
                "Write tests: unit tests for auth helper functions and integration tests for task CRUD and workspace invite endpoints",
                "Deploy to Railway or Render, configure environment variables, set up GitHub Actions CI, write README with screenshots and setup guide"
            ],
            "learning_outcomes": (
                "After completing this project you will:\n"
                f"- Know how to build a multi-user SaaS tool using {skills_str}\n"
                "- Understand role-based access control and JWT authentication\n"
                "- Be able to implement drag-and-drop Kanban boards with status persistence\n"
                "- Have a deployed, working app to show in your portfolio\n"
                "- Understand how to test and document a production-ready application"
            )
        }

    # ── Normalize fields against allowed values ───────────────────────────────
    ALLOWED_CATEGORIES = [
        'Web Development', 'Mobile Development', 'Data Science', 'Machine Learning',
        'Cloud Computing', 'DevOps', 'Cyber Security', 'Artificial Intelligence',
        'Blockchain', 'Game Development'
    ]
    ALLOWED_DURATIONS = [
        '1 week', '2 weeks', '3 weeks', '1 month', '2 months', '3 months', '6 months'
    ]

    category = parsed.get("category", "Web Development")
    if category not in ALLOWED_CATEGORIES:
        category = "Web Development"

    duration = parsed.get("duration", "1 month")
    if duration not in ALLOWED_DURATIONS:
        duration = "1 month"

    technologies = parsed.get("technologies", request.skills)
    if not isinstance(technologies, list):
        technologies = request.skills
    technologies = [str(t) for t in technologies if str(t).strip()]

    prerequisites = parsed.get("prerequisites", [])
    if not isinstance(prerequisites, list):
        prerequisites = []
    prerequisites = [str(p) for p in prerequisites if str(p).strip()]
    if not prerequisites:
        prerequisites = [
            f"Working knowledge of {request.skills[0] if request.skills else 'programming'}",
            "Understanding of REST APIs and HTTP",
            "Basic Git and version control experience"
        ]

    tasks = parsed.get("tasks", [])
    if not isinstance(tasks, list):
        tasks = []
    tasks = [str(t) for t in tasks if str(t).strip()]

    title            = parsed.get("title", "")
    description      = parsed.get("description", "")
    project_desc     = parsed.get("project_description", "")
    learning_outcomes = parsed.get("learning_outcomes", "")
    now              = datetime.now(timezone.utc)

    # ── 1. Save to user_projects (progress tracking, quiz linking) ────────────
    user_doc = {
        "user_id":            request.user_id,
        "skills":             request.skills,
        "title":              title,
        "description":        description,
        "category":           category,
        "difficulty":         parsed.get("difficulty", difficulty),
        "duration":           duration,
        "technologies":       technologies,
        "prerequisites":      prerequisites,
        "project_title":      title,
        "project_description": project_desc,
        "tasks":              tasks,
        "learning_outcomes":  learning_outcomes,
        "status":             "pending",
        "created_at":         now,
    }

    try:
        user_result = user_projects_collection.insert_one(user_doc)
        user_doc["_id"]        = user_result.inserted_id
        user_doc["project_id"] = str(user_result.inserted_id)
    except Exception as e:
        logger.error(f"user_projects insert error: {e}")
        raise HTTPException(status_code=500, detail="Error saving project")

    # ── 2. Save to projects (curated marketplace — Project schema) ────────────
    #   curator = "AI Generated" (fixed value as per requirements)
    curated_doc = {
        "title":               title,
        "description":         description,
        "category":            category,
        "curator":             "AI Generated",
        "technologies":        technologies,
        "difficulty":          parsed.get("difficulty", difficulty),
        "duration":            duration,
        "prerequisites":       prerequisites,
        "project_description": project_desc,
        "created_at":          now,
        "updated_at":          now,
        # extra fields for quiz generation context (not in schema but harmless in Mongo)
        "tasks":               tasks,
        "learning_outcomes":   learning_outcomes,
        "generated_by_user":   request.user_id,
        # ── FIX: store the user_projects _id so the frontend can always
        #    resolve back to the user_projects document when generating a quiz
        "user_project_id":     str(user_result.inserted_id),
    }

    try:
        project_collection.insert_one(curated_doc)
        logger.info(f"Project '{title}' also saved to curated projects collection")
    except Exception as e:
        # Non-fatal — user_projects already saved, quiz generation will still work
        logger.warning(f"projects collection insert failed (non-fatal): {e}")

    return serialize_doc(user_doc)


# ============================================================================
# QUIZ GENERATION
# ============================================================================
@router.post("/api/generate-quiz")
async def generate_quiz(request: GenerateQuizRequest):
    global GeminiClient
    if GeminiClient is None:
        raise HTTPException(status_code=500, detail="google-generativeai not configured")
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    # ── FIX: look up in user_projects first, then fall back to curated projects
    proj = None
    try:
        obj_id = ObjectId(request.project_id)
        proj = user_projects_collection.find_one({"_id": obj_id})
        if not proj:
            # Frontend may have passed the curated projects _id (e.g. navigated
            # directly from the marketplace).  Check that collection too.
            curated = project_collection.find_one({"_id": obj_id})
            if curated:
                # If this curated doc was AI-generated it carries user_project_id;
                # prefer the richer user_projects document when available.
                user_proj_id = curated.get("user_project_id")
                if user_proj_id:
                    try:
                        proj = user_projects_collection.find_one(
                            {"_id": ObjectId(user_proj_id)}
                        )
                    except Exception:
                        pass
                # Still nothing?  Use the curated doc itself — it has all fields.
                if not proj:
                    proj = curated
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid project_id")

    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    title         = proj.get('title', proj.get('project_title', 'Unknown Project'))
    description   = proj.get('description', '')
    proj_desc     = proj.get('project_description', '')
    technologies  = proj.get('technologies', proj.get('skills', []))
    tasks         = proj.get('tasks', [])
    prerequisites = proj.get('prerequisites', [])
    difficulty    = proj.get('difficulty', 'Intermediate')
    category      = proj.get('category', '')
    duration      = proj.get('duration', '')
    outcomes      = proj.get('learning_outcomes', '')
    tech_str      = ', '.join(technologies) if isinstance(technologies, list) else str(technologies)

    ctx = [
        f"Project Title: {title}",
        f"Category: {category}",
        f"Difficulty: {difficulty}",
        f"Duration: {duration}",
        f"Technologies: {tech_str}",
        f"Short Description: {description}",
    ]
    if proj_desc:
        ctx.append(f"Full Project Description:\n{proj_desc[:1200]}")
    if tasks:
        ctx.append("Implementation Tasks:")
        for i, t in enumerate(tasks[:10], 1):
            ctx.append(f"  {i}. {t}")
    if prerequisites:
        ctx.append(f"Prerequisites: {', '.join(prerequisites)}")
    if outcomes:
        ctx.append(f"Learning Outcomes: {outcomes[:300]}")

    full_context = "\n".join(ctx)

    quiz_prompt = f"""You are a senior technical instructor writing a graded quiz.

PROJECT BEING ASSESSED:
{full_context}

Write exactly 10 multiple-choice questions that test whether a student actually built and understood this specific project.

COVERAGE — spread questions across:
- Q1–Q2: Project setup, architecture decisions, and configuration specific to {title}
- Q3–Q4: How the core features of {title} are implemented using {tech_str}
- Q5–Q6: Specific {tech_str} APIs, patterns, and methods used in this project
- Q7–Q8: Error handling, validation, security, and edge cases in {title}
- Q9: Testing and deployment decisions made for {title}
- Q10: A debugging or decision-making scenario — "given this situation in {title}, what do you do?"

RULES:
- Every question must name or reference "{title}" or its specific features — not generic trivia
- Wrong options must be plausible — not obviously silly
- correct_answer is exactly one of: "A", "B", "C", "D"
- Each option starts with its letter: "A) ...", "B) ...", "C) ...", "D) ..."
- explanation must say WHY the correct answer is right AND why others are wrong

RETURN ONLY valid JSON. No markdown. No backticks. Start {{ end }}

{{
  "questions": [
    {{
      "id": 1,
      "question": "Question referencing {title} specifically?",
      "options": ["A) Plausible option", "B) Plausible option", "C) Plausible option", "D) Plausible option"],
      "correct_answer": "A",
      "explanation": "A is correct because [reason specific to {title}]. B is wrong because [reason]. C is wrong because [reason]. D is wrong because [reason]."
    }}
  ]
}}

Generate ALL 10 questions now."""

    generated = call_gemini_json(quiz_prompt)
    parsed = None

    for attempt in range(3):
        if generated is None:
            break
        try:
            parsed = json.loads(generated)
            if "questions" in parsed and len(parsed["questions"]) >= 5:
                break
            raise ValueError(f"Only {len(parsed.get('questions', []))} questions")
        except Exception as e:
            logger.debug(f"Quiz parse attempt {attempt + 1} failed: {e}")
            if attempt < 2:
                generated = call_gemini_json(
                    "CRITICAL: Return ONLY raw JSON. No markdown. No backticks. "
                    "Start with { end with }\n\n" + quiz_prompt
                )

    if parsed is None or "questions" not in parsed:
        logger.warning("Quiz generation failed — using project-aware fallback")
        tech_list = technologies if isinstance(technologies, list) else [str(technologies)]
        t0 = tech_list[0] if tech_list else "the primary technology"
        parsed = {"questions": [
            {"id":1,"question":f"In {title}, what is the primary responsibility of {t0} in the application architecture?","options":["A) Managing application state and rendering the UI","B) Handling file uploads to cloud storage","C) Sending transactional emails to users","D) Running scheduled background jobs"],"correct_answer":"A","explanation":f"In {title}, {t0} is responsible for managing state and rendering. The other options describe separate services not handled by {t0}."},
            {"id":2,"question":f"Which environment setup step is required before running {title} locally?","options":["A) Run the app directly without any configuration","B) Copy .env.example to .env and fill in database and JWT secret values","C) Hard-code database credentials in the source files","D) Disable authentication for local development"],"correct_answer":"B","explanation":"Environment variables must be configured before the app can connect to the database or sign tokens. Hard-coding credentials is a security risk."},
            {"id":3,"question":f"In {title}, how are user passwords stored in the database?","options":["A) As plain text for easy comparison","B) Base64 encoded","C) Hashed with bcrypt and a salt","D) Encrypted with AES-256 symmetrically"],"correct_answer":"C","explanation":"bcrypt hashing with a salt is the industry standard. Plain text and base64 are insecure. AES is symmetric encryption, not suitable for passwords."},
            {"id":4,"question":f"What HTTP status code does the {title} API return when a requested resource is not found?","options":["A) 200 OK","B) 400 Bad Request","C) 404 Not Found","D) 500 Internal Server Error"],"correct_answer":"C","explanation":"404 Not Found is the correct semantic status for a missing resource. 400 is for bad input, 500 is for server errors, 200 means success."},
            {"id":5,"question":f"How does {title} protect routes so only authenticated users can access them?","options":["A) By checking a hardcoded username in the request","B) By validating a JWT token in the Authorization header via middleware","C) By storing the user's password in a session cookie","D) By requiring users to re-enter credentials on every request"],"correct_answer":"B","explanation":"JWT middleware validates the token on protected routes. Hardcoded checks are insecure, passwords in cookies violate security best practices, and re-entering credentials destroys UX."},
            {"id":6,"question":f"In {title}, what happens when a user submits a form with missing required fields?","options":["A) The server crashes with an unhandled exception","B) The data is saved with null values silently","C) The API returns a 400 Bad Request with a descriptive error message","D) The request is redirected to the login page"],"correct_answer":"C","explanation":"Proper validation returns 400 with error details so the client can inform the user. Silent nulls cause data integrity issues and crashes are unacceptable in production."},
            {"id":7,"question":f"What is the correct way to structure the {title} project repository?","options":["A) All files in the root directory with no subfolders","B) Separate folders for routes, models, middleware, and configuration","C) One file per feature with all logic combined","D) Frontend and backend mixed in the same files"],"correct_answer":"B","explanation":"Separation of concerns into routes, models, and middleware directories makes the codebase maintainable and testable."},
            {"id":8,"question":f"How should the {title} database connection be managed in production?","options":["A) Open a new connection for every incoming request","B) Use a connection pool configured via environment variables","C) Hardcode the connection string in main application file","D) Connect only when the first user logs in"],"correct_answer":"B","explanation":"Connection pooling reuses connections efficiently. Opening a new connection per request is extremely slow. Hardcoded strings are a security risk."},
            {"id":9,"question":f"When deploying {title} to production, which practice is most important?","options":["A) Disable all logging to improve performance","B) Configure all secrets as environment variables and never commit them to Git","C) Use the same database as the development environment","D) Turn off authentication for easier testing in production"],"correct_answer":"B","explanation":"Secrets must never be committed to source control. Sharing dev/prod databases risks data corruption. Disabling auth or logging in production creates security and debugging problems."},
            {"id":10,"question":f"A user reports that {title} shows stale data after updating a record. What is the most likely cause and fix?","options":["A) The server is down and needs restarting","B) The frontend is displaying cached state and needs to re-fetch or update local state after the API call","C) The database has been corrupted and needs to be restored","D) The JWT token has expired and the user needs to log in again"],"correct_answer":"B","explanation":"Stale UI data after an update almost always means the frontend state was not refreshed after the successful API call. The fix is to either re-fetch the data or update local state optimistically."},
        ]}

    questions = parsed.get("questions", [])

    validated = []
    for i, q in enumerate(questions[:10], 1):
        correct = str(q.get("correct_answer", "A")).strip()
        if len(correct) > 1:
            correct = correct[0].upper()
        if correct not in ["A", "B", "C", "D"]:
            correct = "A"
        validated.append({
            "id":           q.get("id", i),
            "question":     q.get("question", f"Question {i} about {title}"),
            "options":      q.get("options", ["A) Option A", "B) Option B", "C) Option C", "D) Option D"]),
            "correct_answer": correct,
            "explanation":  q.get("explanation", f"Refer to the {title} project documentation.")
        })

    while len(validated) < 10:
        i = len(validated) + 1
        validated.append({
            "id": i,
            "question": f"What is the best practice for handling errors in the {title} API?",
            "options": ["A) Return descriptive error messages with appropriate HTTP status codes","B) Always return 200 OK regardless of what happened","C) Crash the server so the error is visible","D) Return empty responses on failure"],
            "correct_answer": "A",
            "explanation": "Descriptive errors with correct status codes help clients handle failures gracefully."
        })

    quiz_doc = {
        "project_id":  request.project_id,
        "user_id":     request.user_id,
        "questions":   validated,
        "created_at":  datetime.now(timezone.utc),
        "is_completed": False,
    }
    try:
        result = project_quizzes_collection.insert_one(quiz_doc)
        quiz_id_str = str(result.inserted_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error saving quiz")

    output = [{k: v for k, v in q.items() if k != "correct_answer"} for q in validated]
    return {"quiz_id": quiz_id_str, "questions": output}


# ============================================================================
# STANDARD PROJECT ROUTES (unchanged)
# ============================================================================
@router.get("/projects")
async def get_projects():
    try:
        projects = list(project_collection.find())
        for p in projects:
            p["id"] = str(p["_id"]); del p["_id"]
        return {"projects": projects}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/projects")
async def create_project(project: Project):
    try:
        project_dict = project.model_dump()
        project_dict["created_at"] = datetime.now(timezone.utc)
        project_dict["updated_at"] = datetime.now(timezone.utc)
        if not project_dict.get("curator"):
            raise HTTPException(status_code=400, detail="Curator name is required")
        if not project_dict.get("technologies") or len(project_dict["technologies"]) == 0:
            raise HTTPException(status_code=400, detail="At least one technology is required")
        result = project_collection.insert_one(project_dict)
        return {"id": str(result.inserted_id), "message": "Project Created Successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/projects/{project_id}")
async def update_project(project_id: str, project: Project):
    try:
        existing = project_collection.find_one({"_id": ObjectId(project_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Project not found")
        project_dict = project.model_dump()
        project_dict["created_at"] = existing.get("created_at", datetime.now(timezone.utc))
        project_dict["updated_at"] = datetime.now(timezone.utc)
        if not project_dict.get("curator"):
            raise HTTPException(status_code=400, detail="Curator name is required")
        if not project_dict.get("technologies") or len(project_dict["technologies"]) == 0:
            raise HTTPException(status_code=400, detail="At least one technology is required")
        result = project_collection.update_one({"_id": ObjectId(project_id)}, {"$set": project_dict})
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Project not found or no changes made")
        return {"message": "Project updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    try:
        result = project_collection.delete_one({"_id": ObjectId(project_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"message": "Project deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    try:
        project = project_collection.find_one({"_id": ObjectId(project_id)})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        project["id"] = str(project["_id"]); del project["_id"]
        return project
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/projects/category/{category}")
async def get_projects_by_category(category: str):
    try:
        projects = list(project_collection.find({"category": category}))
        for p in projects:
            p["id"] = str(p["_id"]); del p["_id"]
        return {"projects": projects}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/api/quiz/submit")
async def submit_quiz(sub: QuizSubmission):
    try:
        quiz_doc = project_quizzes_collection.find_one({"_id": ObjectId(sub.quiz_id)})
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid quiz_id")
    if not quiz_doc:
        raise HTTPException(status_code=404, detail="Quiz not found")

    score = 0
    results = []
    for q in quiz_doc.get("questions", []):
        qid     = q.get("id")
        correct = q.get("correct_answer")
        ans     = next((u for u in sub.user_answers if u.get("question_id") == qid), None)
        selected = ans.get("selected_answer") if ans else None
        is_correct = selected == correct
        if is_correct:
            score += 1
        results.append({"question_id": qid, "selected": selected, "correct": correct,
                         "is_correct": is_correct, "explanation": q.get("explanation", "")})

    project_quizzes_collection.update_one(
        {"_id": ObjectId(sub.quiz_id)},
        {"$set": {"is_completed": True, "score": score,
                  "user_answers": sub.user_answers, "submitted_at": datetime.now(timezone.utc)}}
    )
    return {"score": score, "total": len(quiz_doc.get("questions", [])), "results": results}

@router.patch("/api/projects/{project_id}/complete")
async def complete_user_project(project_id: str):
    try:
        result = user_projects_collection.update_one(
            {"_id": ObjectId(project_id)},
            {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc)}}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid project_id")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    updated = user_projects_collection.find_one({"_id": ObjectId(project_id)})
    if updated:
        updated["project_id"] = str(updated.get("_id"))
        updated["_id"]        = str(updated.get("_id"))
    return updated

@router.get("/api/projects/{user_id}")
async def get_user_projects(user_id: str):
    try:
        projects = list(user_projects_collection.find({"user_id": user_id}))
        for p in projects:
            p["project_id"] = str(p.get("_id"))
            p["_id"]        = str(p.get("_id"))
        return {"projects": projects}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/projects/difficulty/{difficulty}")
async def get_projects_by_difficulty(difficulty: str):
    try:
        projects = list(project_collection.find({"difficulty": difficulty}))
        for p in projects:
            p["id"] = str(p["_id"]); del p["_id"]
        return {"projects": projects}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")