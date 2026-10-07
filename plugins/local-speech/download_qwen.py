"""Explicit installation only; meetings never download weights implicitly."""
import sys
from huggingface_hub import snapshot_download

snapshot_download(
    repo_id='Qwen/Qwen3-ASR-1.7B', local_dir=sys.argv[1],
    allow_patterns=['*.json', '*.txt', '*.safetensors'],
)
