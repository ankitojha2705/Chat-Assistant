# AskInternal — Voice-Enabled Enterprise Knowledge Chatbot

An internal chatbot that lets employees ask questions in natural language (text or voice) and get citation-backed answers from company documents. Built with a RAG (Retrieval-Augmented Generation) pipeline on AWS ECS Fargate.

**Live demo:** `https://d209ay6gd4w499.cloudfront.net`

---

## What it does

- **Voice or text queries** — speak or type a question about internal documents
- **RAG pipeline** — retrieves the most relevant document chunks, generates a grounded answer
- **Citations** — every answer links back to the exact source document and page
- **Document ingestion** — upload PDF, DOCX, PPTX, HTML, or TXT files; they are parsed, chunked, embedded, and indexed automatically
- **Conversation history** — past chats are persisted in PostgreSQL and visible in the sidebar
- **Redis caching** — repeated queries return in <10ms

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design document covering:
- End-to-end flow diagram
- STT component (OpenAI gpt-4o-transcribe)
- RAG pipeline (hybrid search: pgvector + BM25)
- LLM response generation with citations (Claude Sonnet 4.6)
- Latency budget and optimizations
- Scaling strategy (ECS Fargate → Kubernetes)
- Observability (OpenTelemetry + Prometheus)
- Security and data governance

### High-level stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Tailwind CSS |
| API | FastAPI (async Python) |
| STT | OpenAI `gpt-4o-transcribe` |
| Embeddings | OpenAI `text-embedding-3-large` |
| Vector store | PostgreSQL + pgvector |
| LLM | Claude Sonnet 4.6 (Anthropic) |
| Cache | Redis (ElastiCache) |
| Auth | JWT/OIDC middleware (dev mode; plug in Azure AD / Okta JWKS URL for production) |
| Infra | AWS ECS Fargate + ALB + CloudFront |
| CI/CD | GitHub Actions |

---

## Project structure

```
Chat-Assistant/
├── backend/
│   ├── app/
│   │   ├── api/            # Route handlers (voice, text, ingest, conversations, health)
│   │   ├── services/       # STT, RAG retrieval, LLM generation, document ingestor
│   │   ├── models/         # Pydantic schemas
│   │   └── core/           # Config, database, auth middleware, telemetry, cache
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/                # Next.js app router
│   ├── components/         # ChatInterface, Sidebar, MessageBubble, VoiceButton, DocumentUpload
│   ├── lib/                # API client, types
│   └── Dockerfile
├── infra/
│   ├── docker-compose.yml  # Local dev (Postgres + Redis)
│   └── ecs/                # ECS task definitions for API and frontend
├── .github/
│   └── workflows/
│       └── deploy.yml      # CI/CD: build → push to ECR → deploy to ECS
├── ARCHITECTURE.md         # Full system design document
└── README.md
```

---

## Local development

**Prerequisites:** Docker, Python 3.12, Node.js 20

### 1. Start Postgres and Redis

```bash
cd infra
docker compose up -d
```

### 2. Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Copy and fill in your keys
cp .env.example .env

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Run the frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Open `http://localhost:3000`.

### Environment variables (backend)

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key (embeddings + STT) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude LLM) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `EMBEDDING_MODEL` | Default: `text-embedding-3-large` |
| `EMBEDDING_DIMENSIONS` | Default: `1536` |
| `JWKS_URL` | OIDC JWKS endpoint (leave blank for dev mode) |

---

## AWS deployment

All infrastructure is provisioned in `us-east-1`.

| Resource | Details |
|---|---|
| ECS Cluster | `chatbot-cluster` (Fargate) |
| API Service | `chatbot-api-service` — 1 vCPU, 2 GB RAM |
| Frontend Service | `chatbot-frontend-service` — 0.5 vCPU, 1 GB RAM |
| Database | RDS PostgreSQL 16 + pgvector extension |
| Cache | ElastiCache Redis 7 |
| Secrets | AWS Secrets Manager (`/chatbot/openai_api_key`, `/chatbot/database_url`, `/chatbot/redis_url`) |
| CDN / HTTPS | CloudFront in front of both ALBs |

### Manual deploy (one-off)

```bash
# Authenticate
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 923259470108.dkr.ecr.us-east-1.amazonaws.com

# Build and push API
docker build --platform linux/amd64 -t chatbot-api ./backend
docker tag chatbot-api:latest 923259470108.dkr.ecr.us-east-1.amazonaws.com/chatbot-api:latest
docker push 923259470108.dkr.ecr.us-east-1.amazonaws.com/chatbot-api:latest

# Build and push frontend (bake in the API URL at build time)
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=https://d31n1e1poahk7r.cloudfront.net \
  -t chatbot-frontend ./frontend
docker tag chatbot-frontend:latest 923259470108.dkr.ecr.us-east-1.amazonaws.com/chatbot-frontend:latest
docker push 923259470108.dkr.ecr.us-east-1.amazonaws.com/chatbot-frontend:latest

# Force redeploy
aws ecs update-service --cluster chatbot-cluster --service chatbot-api-service --force-new-deployment --region us-east-1
aws ecs update-service --cluster chatbot-cluster --service chatbot-frontend-service --force-new-deployment --region us-east-1
```

---

## CI/CD

Every push to `main` triggers the GitHub Actions workflow at `.github/workflows/deploy.yml`:

1. **Build API image** — `./backend` → push to ECR with commit SHA tag
2. **Build Frontend image** — `./frontend` with `NEXT_PUBLIC_API_URL` baked in → push to ECR
3. **Render task definitions** — inject new image URIs into ECS task definitions
4. **Deploy** — rolling update on both ECS services; waits for stability before succeeding

**Required GitHub secrets:**

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user with ECR push + ECS deploy permissions |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret |
| `AWS_ACCOUNT_ID` | `923259470108` |
| `API_PUBLIC_URL` | `https://d31n1e1poahk7r.cloudfront.net` |

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns Redis + DB status |
| `POST` | `/text/query` | Text query → answer + citations |
| `POST` | `/voice/query` | Audio upload → transcript + answer + citations |
| `POST` | `/documents/ingest` | Upload a document for ingestion |
| `GET` | `/documents/status/{job_id}` | Check ingestion status |
| `GET` | `/documents/` | List all ingested documents |
| `GET` | `/conversations/` | List conversations |
| `GET` | `/conversations/{id}/messages` | Get messages for a conversation |
| `DELETE` | `/conversations/{id}` | Delete a conversation |
| `GET` | `/metrics` | Prometheus metrics |

### Example: text query

```bash
curl -X POST https://d31n1e1poahk7r.cloudfront.net/text/query \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the parental leave policy?"}'
```

```json
{
  "answer": "Full-time employees receive 16 weeks of paid parental leave [1].",
  "citations": [
    {
      "id": 1,
      "filename": "HR_Policy_2024.pdf",
      "page": 12,
      "snippet": "Employees who have been with the company for at least 6 months are entitled to 16 weeks..."
    }
  ],
  "conversation_id": "uuid",
  "latency_ms": 1840
}
```

---

## Supported document formats

| Format | Parser |
|---|---|
| PDF | pdfplumber (text + page numbers) |
| DOCX | python-docx (paragraphs + headings) |
| PPTX | python-pptx (text per slide) |
| HTML | BeautifulSoup (strips scripts/styles) |
| TXT / MD | UTF-8 plain text |

---

## Production considerations

- **Auth:** Set `JWKS_URL` in Secrets Manager to your Azure AD / Okta JWKS endpoint to enable real JWT validation. The middleware in `backend/app/core/auth.py` is already wired for RS256 JWT validation.
- **Scaling:** ECS tasks scale horizontally behind the ALB. For >200 concurrent users, migrate to EKS with HPA (see ARCHITECTURE.md §5).
- **Vector store:** pgvector handles up to ~5M vectors well. Migrate to Pinecone/Qdrant when that threshold is hit.
- **Cohere Rerank:** Set `COHERE_API_KEY` to enable cross-encoder reranking for improved retrieval precision.
