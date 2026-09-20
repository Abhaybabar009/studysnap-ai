from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import shutil
import uuid
from fastapi.staticfiles import StaticFiles
from rag import ingest_document, chat_with_context, get_all_sources, delete_source, generate_podcast_script, generate_tts_audio, generate_infographic_image, generate_mind_map_data, lm_studio_client, MODEL_NAME
from math_solver import solve_math_problem, solve_math_problem_sympy

app = FastAPI(title="StudySnap AI Backend")

# Allow CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

class ChatRequest(BaseModel):
    message: str
    history: List[dict] = []
    selected_source_ids: Optional[List[str]] = None
    response_language: Optional[str] = "English"

class AudioOverviewRequest(BaseModel):
    selected_source_ids: Optional[List[str]] = None
    response_language: Optional[str] = "English"

class InfographicRequest(BaseModel):
    selected_source_ids: Optional[List[str]] = None
    style: str = "Bento Grid"
    detail_level: str = "Standard"
    custom_prompt: str = ""
    response_language: Optional[str] = "English"

class MindMapRequest(BaseModel):
    selected_source_ids: Optional[List[str]] = None
    custom_prompt: str = ""
    response_language: Optional[str] = "English"

class MathSolverRequest(BaseModel):
    problem: str
    response_language: Optional[str] = "English"

class UrlRequest(BaseModel):
    url: str

@app.post("/api/sources/upload")
async def upload_sources(files: List[UploadFile] = File(...)):
    """Upload multiple files, process them, and store embeddings in ChromaDB."""
    uploaded_sources = []
    for file in files:
        try:
            file_id = str(uuid.uuid4())
            file_path = f"uploads/{file_id}_{file.filename}"
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
                
            # Process and ingest document into ChromaDB
            doc_meta = ingest_document(file_path, file.filename, file_id)
            uploaded_sources.append(doc_meta)
        except Exception as e:
            import traceback
            print(f"Error processing {file.filename}: {e}")
            traceback.print_exc()
            pass
            
    if not uploaded_sources:
        raise HTTPException(status_code=400, detail="Failed to process any of the uploaded files.")
        
    return {"success": True, "sources": uploaded_sources}

@app.post("/api/sources/url")
async def add_url_source(request: UrlRequest):
    """Add a URL or YouTube link as a source."""
    try:
        url = request.url
        file_id = str(uuid.uuid4())
        doc_meta = ingest_document("", url, file_id)
        return {"success": True, "source": doc_meta}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sources")
async def list_sources():
    """List all ingested sources from the database."""
    try:
        sources = get_all_sources()
        return {"sources": sources}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"sources": []}

@app.delete("/api/sources/{file_id}")
async def remove_source(file_id: str):
    """Delete a source from ChromaDB."""
    try:
        delete_source(file_id)
        if os.path.exists("uploads"):
            for filename in os.listdir("uploads"):
                if filename.startswith(file_id):
                    try:
                        os.remove(os.path.join("uploads", filename))
                    except Exception:
                        pass
        return {"success": True}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Chat with the AI using context retrieved from ChromaDB via LM Studio."""
    try:
        response_text, sources_used = await chat_with_context(
            request.message, 
            request.history, 
            request.selected_source_ids,
            request.response_language
        )
        return {"response": response_text, "sources": sources_used}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/audio-overview")
async def create_audio_overview(request: AudioOverviewRequest):
    """Generate a podcast-style audio overview from selected sources."""
    try:
        script_json = await generate_podcast_script(request.selected_source_ids, request.response_language)
        audio_filename = await generate_tts_audio(script_json)
        return {"success": True, "audio_url": f"http://localhost:8000/uploads/{audio_filename}"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/infographic")
async def create_infographic(request: InfographicRequest):
    """Generate an infographic image from selected sources."""
    try:
        image_filename = await generate_infographic_image(
            request.selected_source_ids,
            request.style,
            request.detail_level,
            request.custom_prompt,
            request.response_language
        )
        return {"success": True, "image_url": f"http://localhost:8000/uploads/{image_filename}"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/mindmap")
async def create_mind_map(request: MindMapRequest):
    """Generate structured JSON Mind Map from selected sources."""
    try:
        mind_map_data = await generate_mind_map_data(
            request.selected_source_ids,
            request.custom_prompt,
            request.response_language
        )
        return {"success": True, "mind_map": mind_map_data}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/math/solve")
async def solve_math(request: MathSolverRequest):
    """Solve math problem using SymPy deterministic solver and optional LLM enrichment."""
    try:
        result = await solve_math_problem(request.problem, lm_studio_client, MODEL_NAME)
        return {"success": True, "result": result}
    except Exception as e:
        try:
            result = solve_math_problem_sympy(request.problem)
            return {"success": True, "result": result}
        except Exception as inner_e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
