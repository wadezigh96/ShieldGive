"""App entrypoint — a port of backend/src/index.ts.

Express + cors() in TS maps to FastAPI + permissive CORSMiddleware
here. `/health` is intentionally NOT enveloped, exactly like TS.
Unknown paths return `{success: false, error: "Not found"}`.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_port
from .pipeline import start_agent, stop_agent
from .routes import router as api_router
from .storage import storage


@asynccontextmanager
async def lifespan(_app: FastAPI):
    storage.add_agent_log("info", "Backend started", {"port": get_port()})
    start_agent()
    yield
    stop_agent()


app = FastAPI(title="shieldgive-backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        return JSONResponse(status_code=404, content={"success": False, "error": "Not found"})
    return JSONResponse(status_code=exc.status_code, content={"success": False, "error": exc.detail})


@app.get("/health")
async def health():
    return {"status": "ok", "service": "shieldgive-backend"}


app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=get_port())
