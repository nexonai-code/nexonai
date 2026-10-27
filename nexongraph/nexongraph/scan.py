"""Walks a folder and sorts files into code, documents and skipped files."""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass, field
from pathlib import Path

from . import OUT_DIR_NAME

CODE_EXT = {
    ".py": "python",
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".mts": "typescript", ".cts": "typescript",
    ".tsx": "tsx",
    ".java": "java",
    ".kt": "kotlin", ".kts": "kotlin",
    ".go": "go",
    ".cs": "csharp",
    ".php": "php",
    ".rb": "ruby",
    ".rs": "rust",
    ".c": "c", ".h": "c",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hh": "cpp",
    ".swift": "swift",
    ".scala": "scala",
    ".lua": "lua",
    ".dart": "dart",
    ".sh": "bash", ".bash": "bash",
    ".ps1": "powershell",
    ".sql": "sql",
}
DOC_EXT = {
    ".md": "markdown", ".markdown": "markdown",
    ".txt": "text", ".rst": "rst",
    ".pdf": "pdf",
    ".docx": "docx",
    ".html": "html", ".htm": "html",
}
SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".venv", "venv", "env",
    ".idea", ".vscode", ".gradle", "build", "dist", "out", "target", ".next", ".nuxt",
    ".cache", ".pytest_cache", ".mypy_cache", ".tox", "coverage", ".terraform",
    "bin", "obj", "Pods", "DerivedData", OUT_DIR_NAME,
}
MAX_CODE_BYTES = 1_500_000
MAX_DOC_BYTES = 60_000_000


@dataclass
class FileEntry:
    path: Path          # absolute
    rel: str            # relative, forward slashes
    kind: str           # "code" | "doc"
    lang: str
    size: int
    sha: str = ""


@dataclass
class ScanResult:
    root: Path
    files: list[FileEntry] = field(default_factory=list)
    skipped: list[tuple[str, str]] = field(default_factory=list)

    @property
    def code(self) -> list[FileEntry]:
        return [f for f in self.files if f.kind == "code"]

    @property
    def docs(self) -> list[FileEntry]:
        return [f for f in self.files if f.kind == "doc"]


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _ignored_patterns(root: Path) -> list[str]:
    pats = []
    p = root / ".nexongraphignore"
    if p.exists():
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                pats.append(line.rstrip("/"))
    return pats


def _matches(rel: str, pats: list[str]) -> bool:
    from fnmatch import fnmatch
    parts = rel.split("/")
    for p in pats:
        if fnmatch(rel, p) or any(fnmatch(part, p) for part in parts):
            return True
    return False


def scan(root: str | Path, with_hash: bool = True) -> ScanResult:
    root = Path(root).resolve()
    if not root.is_dir():
        raise NotADirectoryError(str(root))
    pats = _ignored_patterns(root)
    res = ScanResult(root=root)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(filenames):
            p = Path(dirpath) / name
            rel = p.relative_to(root).as_posix()
            if pats and _matches(rel, pats):
                res.skipped.append((rel, "ignore"))
                continue
            ext = p.suffix.lower()
            try:
                size = p.stat().st_size
            except OSError:
                continue
            if ext in CODE_EXT:
                if size > MAX_CODE_BYTES:
                    res.skipped.append((rel, "too large"))
                    continue
                entry = FileEntry(p, rel, "code", CODE_EXT[ext], size)
            elif ext in DOC_EXT:
                if size > MAX_DOC_BYTES:
                    res.skipped.append((rel, "too large"))
                    continue
                entry = FileEntry(p, rel, "doc", DOC_EXT[ext], size)
            else:
                continue
            if with_hash:
                try:
                    entry.sha = file_hash(p)
                except OSError:
                    res.skipped.append((rel, "unreadable"))
                    continue
            res.files.append(entry)
    return res
