import json
import os
import subprocess
from pathlib import Path

# تحديد مجلد معزول لحماية نظام التشغيل من أي تعديل خارج بيئة العمل
WORKSPACE_DIR = Path(os.getenv("WORKSPACE_DIR", "./workspace")).resolve()
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

IGNORED_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".next", "dist", "build"}
FORBIDDEN_COMMANDS = ["rm -rf /", "mkfs", "dd if=", ":(){", "shutdown", "reboot", "format "]


def _safe_path(rel_path: str) -> Path:
    """التأكد من أن المسار يقع داخل مجلد workspace فقط (حماية من Path Traversal)."""
    target = (WORKSPACE_DIR / rel_path).resolve()
    if target != WORKSPACE_DIR and WORKSPACE_DIR not in target.parents:
        raise ValueError(f"غير مسموح بالوصول لمسار خارج بيئة العمل: {rel_path}")
    return target


def list_files(directory: str = ".") -> str:
    try:
        base = _safe_path(directory)
        if not base.exists():
            return f"المجلد غير موجود: {directory}"
        items = []
        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in sorted(dirs) if d not in IGNORED_DIRS]
            rel_root = Path(root).relative_to(WORKSPACE_DIR)
            for d in dirs:
                items.append(f"[DIR]  {(rel_root / d).as_posix()}/")
            for f in sorted(files):
                items.append(f"[FILE] {(rel_root / f).as_posix()}")
            if len(items) >= 200:
                items.append("... (تم عرض أول 200 عنصر فقط)")
                break
        return "\n".join(items) if items else "بيئة العمل فارغة حالياً."
    except Exception as e:
        return f"خطأ: {e}"


def read_file(path: str, start_line: int = 1, end_line: int = 300) -> str:
    try:
        target = _safe_path(path)
        if not target.is_file():
            return f"الملف غير موجود: {path}"
        lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
        start = max(1, start_line)
        end = min(len(lines), end_line)
        numbered = [f"{i}: {lines[i - 1]}" for i in range(start, end + 1)]
        header = f"--- {path} (الأسطر {start}-{end} من أصل {len(lines)}) ---\n"
        return header + "\n".join(numbered)
    except Exception as e:
        return f"خطأ أثناء قراءة الملف: {e}"


def write_file(path: str, content: str) -> str:
    try:
        target = _safe_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return f"تم حفظ الملف بنجاح: {path} ({len(content)} حرف)"
    except Exception as e:
        return f"خطأ أثناء كتابة الملف: {e}"


def edit_file(path: str, old_text: str, new_text: str) -> str:
    try:
        target = _safe_path(path)
        if not target.is_file():
            return f"الملف غير موجود: {path}"
        content = target.read_text(encoding="utf-8")
        if old_text not in content:
            return "تعذر العثور على النص المطلوب تعديله بدقة داخل الملف. استخدم read_file للتأكد من النص."
        updated = content.replace(old_text, new_text, 1)
        target.write_text(updated, encoding="utf-8")
        return f"تم تعديل الملف بنجاح: {path}"
    except Exception as e:
        return f"خطأ أثناء التعديل: {e}"


def search_code(query: str, directory: str = ".") -> str:
    try:
        base = _safe_path(directory)
        matches = []
        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
            for f in files:
                fp = Path(root) / f
                if fp.stat().st_size > 512_000:
                    continue
                try:
                    text = fp.read_text(encoding="utf-8", errors="ignore")
                    for idx, line in enumerate(text.splitlines(), 1):
                        if query.lower() in line.lower():
                            rel = fp.relative_to(WORKSPACE_DIR).as_posix()
                            matches.append(f"{rel}:{idx}: {line.strip()[:120]}")
                            if len(matches) >= 40:
                                return "\n".join(matches)
                except Exception:
                    continue
        return "\n".join(matches) if matches else f"لم يتم العثور على نتائج لـ: {query}"
    except Exception as e:
        return f"خطأ في البحث: {e}"


def run_command(command: str) -> str:
    low = command.lower()
    if any(bad in low for bad in FORBIDDEN_COMMANDS):
        return "تم رفض الأمر لدواعي الأمان."
    try:
        res = subprocess.run(
            command,
            shell=True,
            cwd=str(WORKSPACE_DIR),
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = (res.stdout or "") + ("\n[STDERR]\n" + res.stderr if res.stderr else "")
        output = output.strip() or "(تم التنفيذ بدون مخرجات)"
        if len(output) > 4000:
            output = output[:4000] + "\n... (تم اختصار المخرجات)"
        return f"رمز الخروج (Exit Code): {res.returncode}\n{output}"
    except subprocess.TimeoutExpired:
        return "انتهت مهلة تنفيذ الأمر (30 ثانية)."
    except Exception as e:
        return f"فشل تشغيل الأمر: {e}"


TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "عرض قائمة بجميع الملفات والمجلدات داخل بيئة العمل لفهم هيكل المشروع.",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "المسار النسبي، الافتراضي '.'"}
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "قراءة محتوى ملف برمجي أو نصي مع أرقام الأسطر لفهمه.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "المسار النسبي للملف"},
                    "start_line": {"type": "integer", "description": "سطر البداية (الافتراضي 1)"},
                    "end_line": {"type": "integer", "description": "سطر النهاية (الافتراضي 300)"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "إنشاء ملف جديد أو استبدال محتوى ملف بالكامل داخل بيئة العمل.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "المسار النسبي للملف"},
                    "content": {"type": "string", "description": "المحتوى الكامل للملف"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": "تعديل جزء محدد من ملف موجود باستبدال نص قديم بنص جديد.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "old_text": {"type": "string", "description": "النص المراد استبداله بدقة"},
                    "new_text": {"type": "string", "description": "النص الجديد"},
                },
                "required": ["path", "old_text", "new_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_code",
            "description": "البحث عن كلمة أو دالة أو متغير داخل جميع ملفات المشروع.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "directory": {"type": "string"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "تشغيل أمر في الطرفية (Terminal) داخل مجلد المشروع لاختبار الكود أو تثبيت الحزم أو تشغيل السكربتات.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "الأمر المراد تنفيذه"}
                },
                "required": ["command"],
            },
        },
    },
]

TOOL_DISPATCH = {
    "list_files": list_files,
    "read_file": read_file,
    "write_file": write_file,
    "edit_file": edit_file,
    "search_code": search_code,
    "run_command": run_command,
}


def execute_tool(name: str, arguments_json: str) -> str:
    fn = TOOL_DISPATCH.get(name)
    if not fn:
        return f"أداة غير معروفة: {name}"
    try:
        args = json.loads(arguments_json) if arguments_json else {}
        if not isinstance(args, dict):
            return "صيغة المعاملات غير صحيحة، يجب أن تكون JSON Object."
        return str(fn(**args))
    except json.JSONDecodeError as e:
        return f"خطأ في تحليل JSON للمعاملات: {e}. أعد المحاولة بصيغة JSON سليمة."
    except TypeError as e:
        return f"معاملات غير متوافقة مع الأداة {name}: {e}"
    except Exception as e:
        return f"خطأ أثناء تنفيذ {name}: {e}"