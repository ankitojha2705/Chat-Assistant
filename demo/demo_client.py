"""
Demo client: record microphone → transcribe → retrieve → answer with citations.

Usage:
    pip install sounddevice soundfile requests rich
    python demo/demo_client.py

Set BASE_URL to point at your running API (default: http://localhost:8000).
In dev mode (DEBUG=true, no JWKS_URL), no token is needed.
"""

import io
import sys
import tempfile

import requests
import sounddevice as sd
import soundfile as sf
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt

BASE_URL = "http://localhost:8000"
HEADERS = {"Authorization": "Bearer dev-token"}  # bypassed in dev mode
SAMPLE_RATE = 16_000
RECORD_SECONDS = 8

console = Console()


def record_audio() -> bytes:
    console.print(f"\n[bold yellow]Recording for {RECORD_SECONDS}s... speak now[/]")
    audio = sd.rec(
        int(RECORD_SECONDS * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="int16",
    )
    sd.wait()
    console.print("[bold green]Recording complete.[/]")

    buf = io.BytesIO()
    sf.write(buf, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.read()


def voice_query(audio_bytes: bytes) -> dict:
    resp = requests.post(
        f"{BASE_URL}/voice/query",
        headers=HEADERS,
        files={"audio": ("recording.wav", audio_bytes, "audio/wav")},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def text_query(query: str) -> dict:
    resp = requests.post(
        f"{BASE_URL}/text/query",
        headers=HEADERS,
        json={"query": query},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def ingest_file(path: str, dept: str = "general") -> dict:
    with open(path, "rb") as f:
        resp = requests.post(
            f"{BASE_URL}/documents/ingest",
            headers=HEADERS,
            files={"file": (path.split("/")[-1], f)},
            data={"dept": dept, "sensitivity": "internal", "allowed_groups": "all"},
            timeout=30,
        )
    resp.raise_for_status()
    return resp.json()


def print_response(result: dict) -> None:
    transcript = result.get("transcript")
    if transcript:
        console.print(Panel(f"[italic]{transcript}[/italic]", title="Transcript", border_style="blue"))

    console.print(Panel(Markdown(result["answer"]), title="Answer", border_style="green"))

    citations = result.get("citations", [])
    if citations:
        console.print("\n[bold]Sources:[/]")
        for c in citations:
            page_info = f", p.{c['page']}" if c.get("page") else ""
            console.print(f"  [{c['id']}] {c['doc']}{page_info}")
            console.print(f"      [dim]{c['snippet'][:120]}...[/dim]")

    latency = result.get("latency_ms", 0)
    cache_hit = result.get("cache_hit", False)
    tag = "[cyan](cached)[/cyan]" if cache_hit else ""
    console.print(f"\n[dim]Latency: {latency}ms {tag}[/dim]")


def check_health() -> bool:
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        data = resp.json()
        console.print(f"[dim]API: ok | Redis: {data['redis']} | DB: {data['database']}[/dim]")
        return True
    except Exception as e:
        console.print(f"[red]Cannot reach API at {BASE_URL}: {e}[/red]")
        return False


def main() -> None:
    console.print(Panel.fit(
        "[bold]Internal Voice Chatbot — Demo Client[/bold]\n"
        "Commands: [v]oice query  [t]ext query  [i]ngest file  [q]uit",
        border_style="bright_blue",
    ))

    if not check_health():
        console.print("[yellow]Start the API with: cd infra && docker compose up[/yellow]")
        sys.exit(1)

    while True:
        choice = Prompt.ask("\nAction", choices=["v", "t", "i", "q"], default="t")

        if choice == "q":
            break

        elif choice == "v":
            try:
                audio = record_audio()
                result = voice_query(audio)
                print_response(result)
            except KeyboardInterrupt:
                console.print("[yellow]Cancelled.[/yellow]")
            except requests.HTTPError as e:
                console.print(f"[red]API error: {e.response.text}[/red]")

        elif choice == "t":
            query = Prompt.ask("Question")
            if not query.strip():
                continue
            try:
                result = text_query(query)
                print_response(result)
            except requests.HTTPError as e:
                console.print(f"[red]API error: {e.response.text}[/red]")

        elif choice == "i":
            path = Prompt.ask("File path")
            dept = Prompt.ask("Department", default="general")
            try:
                result = ingest_file(path, dept)
                console.print(f"[green]Ingestion started: job_id={result['job_id']}[/green]")
                console.print(f"Poll status: GET {BASE_URL}/documents/status/{result['job_id']}")
            except FileNotFoundError:
                console.print(f"[red]File not found: {path}[/red]")
            except requests.HTTPError as e:
                console.print(f"[red]API error: {e.response.text}[/red]")


if __name__ == "__main__":
    main()
