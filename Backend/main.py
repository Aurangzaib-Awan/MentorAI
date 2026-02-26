from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.register import signup 
from routes.course import courseRoute
from routes.register import login
from routes.project import projectRoute 
from routes.admin import admin
from routes import proctoring

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session middleware (validates cookie-based sessions, CSRF)
from middleware import SessionMiddleware
app.add_middleware(SessionMiddleware)

import asyncio
from middleware import session_manager
from seed_accounts import ensure_seed_accounts


@app.on_event("startup")
async def start_session_gc():
    # Ensure seed accounts exist (hr and mentor)
    try:
        ensure_seed_accounts()
    except Exception:
        import traceback
        traceback.print_exc()

    async def _gc_loop():
        while True:
            try:
                session_manager.gc()
            except Exception:
                import traceback
                traceback.print_exc()
            await asyncio.sleep(60 * 10)  # run every 10 minutes

    asyncio.create_task(_gc_loop())

app.include_router(courseRoute.router) 
app.include_router(signup.router)
app.include_router(login.router)
app.include_router(projectRoute.router)
app.include_router(admin.router)
app.include_router(proctoring.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
