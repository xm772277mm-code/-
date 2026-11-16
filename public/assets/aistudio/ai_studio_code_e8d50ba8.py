import os
import urllib.request
import json
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from openai import OpenAI
from pydantic import BaseModel

from tools import TOOLS_SCHEMA, WORKSPACE_DIR, _safe_path, execute_tool, list_files

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "ollama")
DEFAULT_MODEL = os.getenv("LLM_MODEL", "qwen3-coder:30b")

SYSTEM_PROMPT = """أنت مهندس برمجيات خبير (Principal Software Architect) ومساعد ذكاء اصطناعي محلي واسع المعرفة.

قدراتك اللغوية:
- تفهم بدقة جميع اللهجات العربية (المصرية، السعودية والخليجية، الشامية، المغاربية، العراقية، السودانية، اليمنية) بالإضافة إلى الفصحى، وتفهم المصطلحات الإنجليزية المدمجة داخل الكلام العربي أو المكتوبة بحروف لاتينية (Arabizi).
- استخلص النية الهندسية الدقيقة من كلام المستخدم مهما كانت لهجته، ورد عليه بلغة عربية واضحة ومهنية (أو بلهجة قريبة ومفهومة مع الحفاظ على دقة المصطلحات التقنية).

منهجيتك البرمجية في بيئة العمل:
1. قبل تعديل أي مشروع أو الإجابة عن ملفات موجودة، استخدم `list_files` ثم `read_file` أو `search_code` لفهم السياق الكامل.
2. خطط للحل بعمارة برمجية نظيفة (Clean Architecture)، وتأكد من معالجة الأخطاء (Error Handling) والأمان.
3. بعد كتابة الكود عبر `write_file` أو `edit_file`، قم باختباره فعلياً عبر `run_command` (مثل تشغيل اختبارات pytest أو node أو التحقق من الصياغة Syntax) ولا تفترض نجاح الكود قبل اختباره.
4. اشرح للمستخدم ما قمت ببنائه ونتيجة الاختبارات بوضوح.
"""

app = FastAPI(title="Local Arabic Coding Agent")
client = OpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)

# تخزين جلسات المحادثة في الذاكرة
SESSIONS: Dict[str, List[dict]] = {}


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    model: Optional[str] = None


class ResetRequest(BaseModel):
    session_id: str = "default"


@app.get("/")
def serve_ui():
    return FileResponse(Path("static/index.html"))


@app.get("/api/models")
def get_local_models():
    """جلب النماذج المتوفرة محلياً في Ollama تلقائياً."""
    try:
        base_ollama = LLM_BASE_URL.replace("/v1", "")
        with urllib.request.urlopen(f"{base_ollama}/api/tags", timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m["name"] for m in data.get("models", [])]
            return {"models": models or [DEFAULT_MODEL], "default": DEFAULT_MODEL}
    except Exception:
        return {"models": [DEFAULT_MODEL, "qwen3:32b", "qwen3.6:27b", "qwen3:8b"], "default": DEFAULT_MODEL}


@app.get("/api/files")
def api_list_files():
    return {"tree": list_files(".")}


@app.get("/api/file")
def api_read_file(path: str):
    try:
        target = _safe_path(path)
        if not target.is_file():
            raise HTTPException(status_code=404, detail="الملف غير موجود")
        return {"path": path, "content": target.read_text(encoding="utf-8", errors="replace")}
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.post("/api/reset")
def api_reset(req: ResetRequest):
    SESSIONS.pop(req.session_id, None)
    return {"status": "ok"}


@app.post("/api/chat")
def api_chat(req: ChatRequest):
    model = req.model or DEFAULT_MODEL
    history = SESSIONS.setdefault(
        req.session_id,
        [{"role": "system", "content": SYSTEM_PROMPT}],
    )
    history.append({"role": "user", "content": req.message})

    tool_logs = []
    max_steps = 12

    for _ in range(max_steps):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=history,
                tools=TOOLS_SCHEMA,
                temperature=0.2,
            )
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"تعذر الاتصال بالمحرك المحلي ({LLM_BASE_URL}) باستخدام النموذج ({model}). تأكد من تشغيل Ollama وتحميل النموذج. التفاصيل: {e}",
            )

        msg = response.choices[0].message
        assistant_entry = {"role": "assistant", "content": msg.content or ""}

        if msg.tool_calls:
            assistant_entry["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in msg.tool_calls
            ]
            history.append(assistant_entry)

            for tc in msg.tool_calls:
                result = execute_tool(tc.function.name, tc.function.arguments)
                tool_logs.append(
                    {
                        "tool": tc.function.name,
                        "arguments": tc.function.arguments,
                        "output": result[:1500],
                    }
                )
                history.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    }
                )
        else:
            history.append(assistant_entry)
            return {
                "reply": msg.content or "",
                "steps": tool_logs,
                "model": model,
            }

    return {
        "reply": "تم الوصول للحد الأقصى من خطوات التنفيذ لهذه الرسالة. يمكنك طلب إكمال المهمة.",
        "steps": tool_logs,
        "model": model,
    }


if __name__ == "__main__":
    import uvicorn
    print(f"Workspace Directory: {WORKSPACE_DIR}")
    uvicorn.run(app, host="0.0.0.0", port=8080)