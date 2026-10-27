"""NexonGraph: turns a folder (code, documents, PDFs) into a queryable knowledge graph.

Code is parsed locally and deterministically. Documents are structured locally;
an optional semantic pass uses a local model (Ollama) or an online API.
"""

__version__ = "1.0.0"
SCHEMA_VERSION = 1
OUT_DIR_NAME = "nexongraph-out"
