#!/usr/bin/env python3
"""Build a same-origin English pronunciation audio pack for shua-ci-ji.

Default provider (dictionary): downloads available US dictionary recordings.
Optional provider (piper): generates every word with one fixed local Piper voice,
then encodes compact MP3 files through ffmpeg.

The script is resumable: existing valid files in the manifest are retained.
Only Python's standard library is required for the dictionary provider.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSVS = [
    ROOT / "hongbaoshu_jichu.csv",
    ROOT / "hongbaoshu_bikao.csv",
    ROOT / "27ky_shanguo_gaopin.csv",
]
DEFAULT_OUTPUT = ROOT / "assets" / "audio" / "en-us"
DICTIONARY_API = "https://api.dictionaryapi.dev/api/v2/entries/en/{}"
DICTIONARY_MEDIA = "https://api.dictionaryapi.dev/media/pronunciations/en/{}-us.mp3"
USER_AGENT = "shua-ci-ji-pronunciation-pack/1.0"
MIN_AUDIO_BYTES = 128
PRINT_LOCK = threading.Lock()


@dataclass(frozen=True)
class BuildResult:
    key: str
    path: str = ""
    source: str = ""
    source_url: str = ""
    error: str = ""
    skipped: bool = False


def normalize_word(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("’", "'").replace("‘", "'")
    text = re.sub(r"^[^A-Za-z0-9]+|[^A-Za-z0-9'-]+$", "", text)
    text = re.sub(r"^['-]+|['-]+$", "", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


def load_words(csv_paths: Iterable[Path]) -> list[str]:
    words: dict[str, None] = {}
    for csv_path in csv_paths:
        if not csv_path.exists():
            raise FileNotFoundError(f"词库不存在：{csv_path}")
        with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or "单词" not in reader.fieldnames:
                raise ValueError(f"词库缺少‘单词’列：{csv_path}")
            for row in reader:
                key = normalize_word(row.get("单词", ""))
                if key:
                    words[key] = None
    return list(words)


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default


def atomic_write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def entry_file(output_dir: Path, entry) -> Path | None:
    if isinstance(entry, str):
        rel = entry
    elif isinstance(entry, dict):
        rel = str(entry.get("path", ""))
    else:
        return None
    marker = "assets/audio/en-us/"
    rel = rel.replace("\\", "/")
    if marker in rel:
        rel = rel.split(marker, 1)[1]
    else:
        rel = rel.lstrip("./")
    target = (output_dir / rel).resolve()
    try:
        target.relative_to(output_dir.resolve())
    except ValueError:
        return None
    return target


def valid_existing_entry(output_dir: Path, entry) -> bool:
    path = entry_file(output_dir, entry)
    return bool(path and path.is_file() and path.stat().st_size > MIN_AUDIO_BYTES)


def make_request(url: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "audio/mpeg,audio/*;q=0.9,application/json;q=0.8,*/*;q=0.5",
        },
    )


def fetch_bytes(url: str, timeout: float, retries: int) -> tuple[bytes, str]:
    last_error = ""
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(make_request(url), timeout=timeout) as response:
                data = response.read()
                content_type = str(response.headers.get("Content-Type", "")).lower()
                if len(data) <= MIN_AUDIO_BYTES:
                    raise ValueError("响应过小")
                return data, content_type
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError) as exc:
            last_error = str(exc)
            if attempt < retries:
                time.sleep(min(3.0, 0.45 * (2**attempt)))
    raise RuntimeError(last_error or "下载失败")


def is_us_audio_url(url: str) -> bool:
    return bool(re.search(r"(?:-|_|/)(?:us|usa)(?:\.|-|_|/)|en-us", str(url or ""), re.I))


def dictionary_audio_urls(key: str, timeout: float, retries: int) -> list[str]:
    urls = [DICTIONARY_MEDIA.format(urllib.parse.quote(key, safe=""))]
    api_url = DICTIONARY_API.format(urllib.parse.quote(key, safe=""))
    try:
        raw, _ = fetch_bytes(api_url, timeout, retries)
        payload = json.loads(raw.decode("utf-8"))
        phonetics = []
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict) and isinstance(item.get("phonetics"), list):
                    phonetics.extend(item["phonetics"])
        discovered = [str(item.get("audio", "")).strip() for item in phonetics if isinstance(item, dict)]
        discovered = [url for url in discovered if url]
        discovered.sort(key=lambda url: (not is_us_audio_url(url), url))
        urls.extend(discovered)
    except Exception:
        pass
    result: list[str] = []
    for url in urls:
        if url and url not in result:
            result.append(url)
    return result


def manifest_path_for(key: str, extension: str) -> tuple[str, Path]:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    rel = Path("files") / digest[:2] / f"{digest[:24]}{extension}"
    web = "./assets/audio/en-us/" + rel.as_posix()
    return web, rel


def write_atomic_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".part")
    temp.write_bytes(data)
    os.replace(temp, path)


def build_dictionary_word(key: str, output_dir: Path, timeout: float, retries: int) -> BuildResult:
    errors: list[str] = []
    for url in dictionary_audio_urls(key, timeout, retries):
        try:
            data, content_type = fetch_bytes(url, timeout, retries)
            if "json" in content_type or data.lstrip().startswith((b"{", b"[")):
                raise ValueError("返回的不是音频")
            extension = ".mp3"
            if "ogg" in content_type or urllib.parse.urlparse(url).path.lower().endswith((".ogg", ".opus")):
                extension = ".ogg"
            web_path, rel_path = manifest_path_for(key, extension)
            write_atomic_bytes(output_dir / rel_path, data)
            return BuildResult(key=key, path=web_path, source="dictionary-us", source_url=url)
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    return BuildResult(key=key, error="; ".join(errors[-2:]) or "没有可用的美式音频")


def find_command(value: str) -> str:
    path = shutil.which(value) if not Path(value).exists() else value
    if not path:
        raise FileNotFoundError(f"找不到命令：{value}")
    return str(path)


def run_checked(command: list[str], input_text: str | None = None) -> None:
    completed = subprocess.run(
        command,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        message = (completed.stderr or completed.stdout or "命令执行失败").strip()
        raise RuntimeError(message[-1000:])


def build_piper_word(
    key: str,
    output_dir: Path,
    piper_bin: str,
    piper_model: Path,
    ffmpeg_bin: str,
) -> BuildResult:
    web_path, rel_path = manifest_path_for(key, ".mp3")
    target = output_dir / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="shua-audio-") as temp_dir:
        wav_path = Path(temp_dir) / "word.wav"
        mp3_path = Path(temp_dir) / "word.mp3"
        try:
            run_checked([piper_bin, "--model", str(piper_model), "--output_file", str(wav_path)], key + "\n")
            run_checked([
                ffmpeg_bin,
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(wav_path),
                "-ac",
                "1",
                "-ar",
                "24000",
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "48k",
                str(mp3_path),
            ])
            if not mp3_path.exists() or mp3_path.stat().st_size <= MIN_AUDIO_BYTES:
                raise RuntimeError("生成文件无效")
            write_atomic_bytes(target, mp3_path.read_bytes())
            return BuildResult(key=key, path=web_path, source=f"piper:{piper_model.name}")
        except Exception as exc:
            return BuildResult(key=key, error=str(exc))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="生成刷词机同源美式单词音频包")
    parser.add_argument("--provider", choices=("dictionary", "piper"), default="dictionary")
    parser.add_argument("--csv", action="append", dest="csvs", help="词库 CSV，可重复传入；默认读取项目三份词库")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--workers", type=int, default=4, help="dictionary 并发数；Piper 强制为 1")
    parser.add_argument("--timeout", type=float, default=12.0)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--limit", type=int, default=0, help="只处理前 N 个词，0 表示全部")
    parser.add_argument("--force", action="store_true", help="覆盖已有有效音频")
    parser.add_argument("--check", action="store_true", help="只检查词数、清单和环境，不生成")
    parser.add_argument("--piper-bin", default="piper")
    parser.add_argument("--piper-model", type=Path)
    parser.add_argument("--ffmpeg-bin", default="ffmpeg")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    csv_paths = [Path(item).resolve() for item in args.csvs] if args.csvs else DEFAULT_CSVS
    output_dir = args.output.resolve()
    manifest_path = output_dir / "manifest.json"
    missing_path = output_dir / "missing.json"
    words = load_words(csv_paths)
    if args.limit > 0:
        words = words[: args.limit]

    old_manifest = read_json(manifest_path, {})
    old_entries = old_manifest.get("entries", {}) if isinstance(old_manifest, dict) else {}
    if not isinstance(old_entries, dict):
        old_entries = {}
    entries = {
        normalize_word(key): value
        for key, value in old_entries.items()
        if normalize_word(key) and valid_existing_entry(output_dir, value)
    }
    pending = [key for key in words if args.force or key not in entries]

    piper_bin = ffmpeg_bin = ""
    if args.provider == "piper":
        if not args.piper_model or not args.piper_model.is_file():
            raise SystemExit("--provider piper 时必须提供有效的 --piper-model")
        piper_bin = find_command(args.piper_bin)
        ffmpeg_bin = find_command(args.ffmpeg_bin)

    print(f"唯一单词：{len(words)}；已有有效音频：{len(entries)}；待处理：{len(pending)}")
    if args.check:
        return 0

    output_dir.mkdir(parents=True, exist_ok=True)
    failures: dict[str, str] = {}
    completed = 0
    started = time.time()

    def build(key: str) -> BuildResult:
        if args.provider == "dictionary":
            return build_dictionary_word(key, output_dir, args.timeout, max(0, args.retries))
        return build_piper_word(key, output_dir, piper_bin, args.piper_model.resolve(), ffmpeg_bin)

    workers = 1 if args.provider == "piper" else max(1, min(12, args.workers))
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(build, key): key for key in pending}
        try:
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                completed += 1
                if result.path:
                    entries[result.key] = {
                        "path": result.path,
                        "source": result.source,
                        **({"sourceUrl": result.source_url} if result.source_url else {}),
                    }
                    failures.pop(result.key, None)
                else:
                    failures[result.key] = result.error or "生成失败"
                if completed % 20 == 0 or completed == len(pending):
                    elapsed = max(0.001, time.time() - started)
                    with PRINT_LOCK:
                        print(f"进度 {completed}/{len(pending)}，成功 {len(entries)}/{len(words)}，速度 {completed / elapsed:.1f} 词/秒")
                    manifest = {
                        "schemaVersion": 1,
                        "language": "en-US",
                        "voice": "dictionary-us" if args.provider == "dictionary" else args.piper_model.name,
                        "provider": args.provider,
                        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "entryCount": len(entries),
                        "entries": dict(sorted(entries.items())),
                    }
                    atomic_write_json(manifest_path, manifest)
                    atomic_write_json(missing_path, {"count": len(failures), "entries": dict(sorted(failures.items()))})
        except KeyboardInterrupt:
            for future in futures:
                future.cancel()
            print("已中断；当前已完成结果仍会写入清单。", file=sys.stderr)

    manifest = {
        "schemaVersion": 1,
        "language": "en-US",
        "voice": "dictionary-us" if args.provider == "dictionary" else args.piper_model.name,
        "provider": args.provider,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "entryCount": len(entries),
        "entries": dict(sorted(entries.items())),
    }
    atomic_write_json(manifest_path, manifest)
    atomic_write_json(missing_path, {"count": len(failures), "entries": dict(sorted(failures.items()))})
    print(f"完成：清单 {manifest_path}；有效音频 {len(entries)}；失败 {len(failures)}")
    return 0 if not failures else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrokenPipeError:
        raise SystemExit(1)
