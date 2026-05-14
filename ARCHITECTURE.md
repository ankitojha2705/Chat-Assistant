# Architecture: Internal Voice-Enabled Chatbot

## Table of Contents
1. [System Overview](#1-system-overview)
2. [End-to-End Flow](#2-end-to-end-flow)
3. [Component Deep Dives](#3-component-deep-dives)
   - 3.1 [Speech-to-Text (STT)](#31-speech-to-text-stt)
   - 3.2 [RAG Pipeline](#32-rag-pipeline)
   - 3.3 [LLM Response Generation](#33-llm-response-generation)
4. [Latency Budget & Optimization](#4-latency-budget--optimization)
5. [Scaling Strategy](#5-scaling-strategy)
6. [Observability](#6-observability)
7. [Security & Data Governance](#7-security--data-governance)
8. [Production Readiness Checklist](#8-production-readiness-checklist)

---

## 1. System Overview

### Problem
Employees spend significant time searching across internal wikis, PDFs, policy docs, and
knowledge bases to find answers. A voice-first interface reduces friction and allows
hands-free access to institutional knowledge — with cited, trustworthy answers grounded
in actual internal documents.

### Solution
A **Retrieval-Augmented Generation (RAG)** system where:
1. Employee speaks a question (via browser)
2. Audio is transcribed to text (STT)
3. Relevant document chunks are retrieved from a vector store
4. An LLM synthesizes a grounded answer with citations pointing back to source documents

### Tech Stack

| Layer | Technology | Justification |
|---|---|---|
| Frontend | React / Next.js | Web-based voice interface with text fallback |
| STT | OpenAI `gpt-4o-transcribe` | Higher accuracy than Whisper for domain-specific terminology; no self-hosting |
| Document Parsing | Unstructured.io | Unified API for PDF, DOCX, HTML, PPTX, and other internal formats |
| Embeddings | OpenAI `text-embedding-3-large` | High-quality semantic embeddings (3072-dim, MTEB top performer) |
| Vector Store | **pgvector** (MVP) → Pinecone / Qdrant (production) | Start simple with existing Postgres; migrate when scale demands |
| Retrieval | Hybrid search + metadata filtering | Combines semantic search, keyword matching, and permission checks |
| Reranker | Cohere Rerank *(optional, production)* | Improves top-k relevance; add when retrieval precision becomes a bottleneck |
| LLM | Claude Sonnet 4.6 | Best citation faithfulness, 200K context, instruction-following quality |
| Backend | FastAPI | Async APIs, streaming support, easy Python AI tooling integration |
| Cache | Redis | Caches frequent queries — repeated questions return in <10ms |
| Async Ingestion | FastAPI `BackgroundTasks` | Non-blocking doc ingestion without a separate queue service |
| Auth | OAuth2/OIDC (Azure AD / Okta) | Enterprise SSO and role-based access control |
| Observability | OpenTelemetry + Prometheus + Grafana | Tracks latency, errors, retrieval quality, and system health |
| Deployment | Docker (MVP) → Kubernetes (production) | Simple prototype with a clear path to scale |

---

## 2. End-to-End Flow

### Query Flow (voice → answer)

```
Employee (browser)
      │
      │  1. Record audio (MediaRecorder API / WebRTC)
      ▼
API Gateway  (TLS, rate limiting, WAF)
      │
      │  2. POST /voice/query  { audio: <bytes>, session_id }
      ▼
Auth Middleware
      │  3. Validate Bearer JWT (Azure AD / Okta JWKS)
      │  4. Extract user groups → document access scope
      ▼
STT Service
      │  5. Forward audio → OpenAI gpt-4o-transcribe
      │  6. Receive transcript: "What is our parental leave policy?"
      ▼
Redis Cache
      │  7. SHA-256(transcript + user_scope) → cache lookup
      │     Cache HIT  → return cached answer immediately (~5ms)
      ▼
RAG Service
      │  8. Embed query → OpenAI text-embedding-3-large
      │  9. pgvector ANN search: top-20 chunks (filtered by user ACL)
      │  10. PostgreSQL BM25 full-text search: top-20 chunks
      │  11. Reciprocal Rank Fusion → merged top-20 candidates
      │  12. [Production] Cohere Rerank → top-5 highest-relevance chunks
      ▼
LLM Service  (Claude Sonnet 4.6)
      │  13. Build prompt: system + context chunks + user question
      │  14. Stream response via Server-Sent Events (SSE)
      │  15. Extract citations from response
      ▼
Redis Cache
      │  16. Store answer (TTL: 10 min)
      ▼
Response to Client
       {
         "answer": "Employees are entitled to 16 weeks of paid parental leave [1]...",
         "citations": [
           { "id": 1, "doc": "HR_Policy_2024.pdf", "page": 12, "snippet": "..." }
         ],
         "transcript": "What is our parental leave policy?",
         "latency_ms": 1840
       }
```

### Document Ingestion Flow

```
Admin / HR Team
      │
      │  POST /documents/ingest  { file: <binary>, dept, sensitivity }
      ▼
Auth Middleware
      │
      ▼
Ingest API
      │  Returns immediately: { job_id, status: "processing" }
      │
      ▼  FastAPI BackgroundTask (same process, async)
Worker coroutine
      │  1. Parse with Unstructured.io → structured elements
      │  2. Chunk: 512 tokens, 50-token overlap
      │  3. Attach metadata: { doc_id, filename, page, dept, sensitivity, allowed_groups }
      │  4. Batch embed: OpenAI text-embedding-3-large
      │  5. Upsert vectors + metadata to pgvector
      │  6. Update Document record: status → "indexed"
      ▼
Client polls  GET /documents/status/{job_id}  → { status: "indexed", chunk_count: 42 }
```

---

## 3. Component Deep Dives

### 3.1 Speech-to-Text (STT)

**Why `gpt-4o-transcribe` over `whisper-1`:**
- Lower word error rate on domain-specific terminology (internal project names, acronyms)
- Better punctuation and sentence boundary detection
- Same API contract — trivial to swap if cost is a concern

**Audio handling:**
```
Client captures: WebM/Opus (browser native) or WAV
Max file size:   25 MB per OpenAI API limit
Long audio:      Split on silence with pydub VAD → process chunks → concatenate transcripts

API call:
  openai.audio.transcriptions.create(
      model="gpt-4o-transcribe",
      file=audio_bytes,
      response_format="verbose_json"   # word-level timestamps + confidence
  )
```

**Latency:** ~400–700 ms for a 5-second clip

**Fallback strategy:**
- If STT API latency > 2 s or error: fall back to browser Web Speech API (zero-latency, client-side)
- Circuit breaker: after 3 consecutive failures → route all traffic to fallback until healthy

---

### 3.2 RAG Pipeline

#### Document Chunking

```
Strategy: sliding window over token-encoded text
  chunk_size:    512 tokens
  chunk_overlap: 50 tokens
  separators:    ["\n\n", "\n", ". ", " "]

Why 512 tokens:
  - Fits full semantic units (policy paragraphs, procedure steps)
  - Small enough for precise citation snippets shown to users
  - Well within embedding model context limit (8 191 tokens)

Structured content:
  - Unstructured.io preserves table structure → embed as Markdown
  - Lists chunked at item boundaries, not mid-item
```

#### Hybrid Retrieval

```
1. Dense search  (semantic similarity)
   Embed query → pgvector cosine similarity ANN search → top-20
   Index: HNSW (m=16, ef_construction=64) — sub-50ms at 1M vectors

2. Sparse search  (keyword matching)
   PostgreSQL full-text search on GIN-indexed tsvector → top-20
   Catches exact term matches missed by semantic search

3. Fusion
   Reciprocal Rank Fusion (RRF) merges both ranked lists → top-20 candidates
   RRF score = Σ 1/(k + rank)  where k=60

4. Access control  (enforced at DB query time)
   Every chunk stored with allowed_groups: ["hr", "all"]
   pgvector WHERE filter: allowed_groups && user_groups  (array overlap)
   Users only receive chunks they are authorized to see

5. Reranker  [production add-on]
   Cohere Rerank v3 cross-encoder re-scores top-20 → top-5
   Chunks with relevance score < 0.3 discarded to prevent noisy context
```

#### pgvector → Pinecone Migration Path

```
MVP:  pgvector on existing Postgres instance
      Zero extra infra; works well up to ~5M vectors

Trigger to migrate:
  - p95 query latency > 200ms at peak load
  - Vector count exceeds ~5M
  - Multi-region replication needed

Migration: background re-index job with dual-write period → zero downtime
```

---

### 3.3 LLM Response Generation

#### Prompt Design

```
SYSTEM:
You are an internal knowledge assistant. Answer ONLY using the provided context.
For each factual claim, add a citation marker like [1], [2] referencing the source number.
If the context does not contain enough information, say exactly:
"I don't have that information in our internal documents."
Do not speculate, invent facts, or use external knowledge.

CONTEXT:
[1] Source: HR_Policy_2024.pdf, Page 12
"Employees who have been with the company for at least 6 months are entitled to
16 weeks of fully paid parental leave..."

[2] Source: Benefits_Guide_Q1_2025.pdf, Page 3
"Parental leave applies equally to primary and secondary caregivers..."

USER: What is our parental leave policy?
```

#### Streaming

```python
async with client.messages.stream(
    model="claude-sonnet-4-6",
    system=system_prompt,
    messages=[{"role": "user", "content": user_message}],
    max_tokens=1024,
) as stream:
    async for text in stream.text_stream:
        yield f"data: {text}\n\n"   # Server-Sent Events
```

First token arrives in ~300 ms — user sees the answer start appearing immediately.

#### Citation Extraction

```python
used_ids = {int(m) for m in re.findall(r'\[(\d+)\]', full_response)}
used_citations = [c for c in citations if c.id in used_ids]
```

#### Hallucination Mitigation

- "Answer only from context" system instruction — strict
- Relevance threshold: discard reranked chunks with score < 0.3
- Response post-validation: detect sentences without citations → flag for review
- User feedback loop: thumbs up/down rate tracked weekly

---

## 4. Latency Budget & Optimization

### Target: P95 < 3 seconds end-to-end

| Step | Baseline | Optimized | Technique |
|---|---|---|---|
| Audio upload | 200 ms | 50 ms | Opus codec compression |
| STT (gpt-4o-transcribe) | 700 ms | 500 ms | Keep-alive connections |
| Embed query | 150 ms | 50 ms | Connection pool reuse |
| pgvector ANN search | 80 ms | 30 ms | HNSW index; same-region DB |
| BM25 full-text search | 40 ms | 20 ms | GIN index on tsvector |
| [Optional] Cohere Rerank | 120 ms | 80 ms | Async, runs in parallel |
| Claude (first token) | 300 ms | 300 ms | Streaming; prompt caching |
| **Total (first token)** | **~1 590 ms** | **~1 030 ms** | |

### Key Optimizations

**1. Redis Query Cache**
```
Key:  SHA-256(normalized_query + sorted_user_groups)
TTL:  10 min (general), 1 hr (stable policy docs)
Expected hit rate: 30–40% (many employees ask similar questions)
Cache HIT latency: ~5ms vs ~1.5s for full pipeline
```

**2. Claude Prompt Caching**
```
Cache the static system prompt across requests
→ ~60% reduction in input token processing time
→ Cost savings proportional to prompt length
```

**3. pgvector HNSW Index**
```sql
CREATE INDEX ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

**4. Async Parallel Execution**
```python
# Dense search + sparse search run concurrently
dense_task = asyncio.create_task(dense_search(embedding))
sparse_task = asyncio.create_task(sparse_search(query))
dense, sparse = await asyncio.gather(dense_task, sparse_task)
```

---

## 5. Scaling Strategy

### MVP → Production Progression

```
MVP  (docker compose up, single machine)
│
│  Trigger: >50 concurrent users OR p95 > 3s
▼
Managed services  (RDS Postgres, ElastiCache Redis, same codebase)
│
│  Trigger: >200 concurrent users OR team size >200
▼
Kubernetes  (EKS / GKE, HPA, multi-AZ)
```

### Kubernetes Architecture (Production)

```
                    ┌──────────────────────────────────────────┐
                    │            Kubernetes Cluster             │
Internet ─► CDN/WAF ─► Ingress Controller                     │
                │   │        │                                  │
                │   │  ┌─────▼──────────────────┐             │
                │   │  │  API Pods (FastAPI)     │             │
                │   │  │  HPA: 3–20 replicas     │◄───────────┼── CPU / RPS metrics
                │   │  │  CPU target: 60%        │             │
                │   │  └────────────────────────┘             │
                │   └──────────────────────────────────────────┘
                │
                │         ┌─────────────────────────┐
                │         │    Managed Services      │
                │         │  RDS Postgres+pgvector   │
                │         │  ElastiCache Redis       │
                │         │  S3 (raw doc storage)    │
                │         └─────────────────────────┘
                │
                └─► External APIs  (OpenAI, Anthropic, Cohere)
                    Circuit breakers + API key rotation
```

### Auto-Scaling

```yaml
targetCPUUtilizationPercentage: 60
minReplicas: 3    # always-on for high availability
maxReplicas: 20
```

### Rate Limiting

```
Per-user:       60 requests / minute
Per-department: 500 requests / minute
Global:         2 000 requests / minute  (protects API budgets)
Enforced at:    API Gateway (CloudFlare / Kong)
```

---

## 6. Observability

### Metrics  (Prometheus + Grafana)

```
query_latency_p50/p95/p99   — by component: stt, rag, llm, total
stt_error_rate              — gpt-4o-transcribe failures
retrieval_precision_at_5    — % queries where top-5 contains the answer
cache_hit_rate              — Redis hit % (target >35%)
llm_token_usage             — input + output tokens (cost tracking)
error_rate_by_endpoint      — 4xx/5xx per route
user_feedback_thumbs_up     — answer quality signal
```

### Distributed Tracing  (OpenTelemetry → Jaeger / Tempo)

```python
with tracer.start_as_current_span("voice_query") as span:
    span.set_attribute("user.dept", user.dept)

    with tracer.start_as_current_span("stt"):
        transcript = await stt_service.transcribe(audio)

    with tracer.start_as_current_span("rag"):
        chunks = await rag_service.retrieve(transcript, user.groups)
        span.set_attribute("rag.chunks_retrieved", len(chunks))

    with tracer.start_as_current_span("llm"):
        answer = await llm_service.generate(transcript, chunks)
```

Full latency waterfall for every request, visible in Jaeger.

### Structured Logging

```json
{
  "timestamp": "2026-05-13T18:00:00Z",
  "trace_id": "abc123",
  "user_id_hash": "sha256:...",
  "dept": "engineering",
  "query_hash": "sha256:...",
  "stt_ms": 580,
  "rag_ms": 310,
  "llm_ms": 870,
  "total_ms": 1760,
  "cache_hit": false,
  "chunks": 5
}
```

No raw query text or PII in logs — only hashes.

### Alerting

```
P1  error_rate > 5% for 2 min          → PagerDuty immediately
P1  p95 latency > 10s for 5 min        → page on-call
P2  cache_hit_rate < 20%               → investigate next business day
P3  llm_token_cost > $500/day          → budget alert
```

### LLM Quality Monitoring

```
Weekly dashboard:
  - Citation coverage:  % claims backed by a [n] marker
  - Thumbs-up rate:     target >80%
  - "I don't know" rate: % queries with no answer (indicates retrieval gaps)

Alert: thumbs-up drops >10% week-over-week → retrieval or prompt regression
```

---

## 7. Security & Data Governance

### Authentication & Authorization

```
Flow:
  1. User authenticates via SSO (Azure AD / Okta) → JWT (1-hour TTL)
  2. Every API request: Authorization: Bearer <jwt>
  3. Backend validates JWT signature via JWKS (public keys cached 5 min)
  4. Extract claims: { sub, email, groups: ["hr", "engineering"] }
  5. groups → pgvector WHERE filter: allowed_groups && user_groups

Document ACL:
  - Chunks tagged at ingest: { dept, sensitivity: "public|internal|confidential" }
  - "confidential": allowed_groups = ["executives", "legal"]
  - ACL enforced at the database query — not in application logic alone
```

### Data Privacy

```
Audio:        NOT stored after transcription (deleted from memory post-STT)
              Optional: 24-hour encrypted retention if user enables voice history (opt-in)

Query logs:   query_hash only (SHA-256), never raw query text
User IDs:     hashed in all logs and metrics

Data residency:
  EU employees → processed in eu-west-1 only (GDPR)
  OpenAI + Anthropic → zero-retention API tier (no training on company data)

At rest:   S3 (SSE-KMS), RDS (AES-256), Redis (ElastiCache encryption)
In transit: TLS 1.3 minimum; mTLS for internal service-to-service
```

### Secrets Management

```
Local dev:   .env file (gitignored — never commit API keys)
Production:  AWS Secrets Manager or HashiCorp Vault
Kubernetes:  External Secrets Operator syncs → K8s Secrets
Rotation:    API keys rotated every 90 days (automated)
```

### Threat Model

| Threat | Mitigation |
|---|---|
| Unauthorized document access | pgvector ACL filter + JWT group claims |
| Prompt injection via documents | Documents are data, not instructions; input sanitized |
| Data exfiltration via LLM | Answer length cap; rate limiting |
| Replay attacks | JWT short TTL (1 h) |
| DDoS | CDN/WAF + rate limiting at API gateway |
| API key theft | Keys in Vault; automatic rotation |
| Audio eavesdropping | TLS 1.3; audio deleted post-transcription |

---

## 8. Production Readiness Checklist

### Pre-Launch
- [ ] Load test: 500 concurrent users → validate P95 < 3s
- [ ] Chaos test: kill Redis, kill Postgres, kill STT API → verify fallbacks activate
- [ ] Security pen test: auth bypass, prompt injection, OWASP Top 10
- [ ] Legal review: employee consent for voice data (GDPR Art. 9, CCPA)
- [ ] DPA signed with OpenAI + Anthropic (zero-retention API tier)
- [ ] DR drill: RTO < 1 h, RPO < 15 min

### Deployment Strategy

```
1. Feature branch → PR → automated tests
2. Merge to main → deploy to staging (production mirror)
3. Canary: 5% traffic → monitor error rate + latency for 15 min
4. Progressive rollout: 10% → 25% → 50% → 100% over 2 h
5. Auto-rollback if error_rate > 2% OR p95 > 5s

Zero-downtime:
  - Rolling updates (maxSurge: 1, maxUnavailable: 0)
  - DB migrations: expand/contract pattern (always backward-compatible)
  - Feature flags for new prompts/models
```

### Cost Estimate  (1 000 employees, 50 queries/day)

```
50 000 queries/day × 30 days = 1.5M queries/month

gpt-4o-transcribe:   ~$0.006/min × ~0.13 min avg × 1.5M  =  ~$1 170/mo
OpenAI Embeddings:   ~$0.00013/1K tokens × 1.5M           =    ~$195/mo
Cohere Rerank:       ~$0.001/query × 1.5M                 =  ~$1 500/mo  [optional]
Claude Sonnet 4.6:   ~$0.003/query × 1.5M                 =  ~$4 500/mo
RDS Postgres (r6g.large Multi-AZ):                         =    ~$300/mo
Redis ElastiCache:                                         =    ~$200/mo
S3 + misc:                                                 =    ~$300/mo

Total with Cohere:   ~$8 165/month  (~$0.005/query)
Total without:       ~$6 665/month  (~$0.004/query)

Cache hit rate of 35% reduces LLM + STT costs by ~35% in practice.
```
