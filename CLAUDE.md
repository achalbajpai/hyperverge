# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo containing two main applications:

- **sensai-ai/**: FastAPI-based Python backend with SQLite database
- **sensai-frontend/**: Next.js 15 React frontend with TypeScript

## Development Commands

### Backend (sensai-ai/)

```bash
# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run tests with coverage
./run_tests.sh

# Run single test file
python -m pytest tests/api/db/test_user_db.py -v

# Start development server (refer to INSTALL.md for full setup)
uvicorn src.api.main:app --reload
```

### Frontend (sensai-frontend/)

```bash
# Install dependencies
npm ci

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run tests with coverage
npm run test:ci

# Lint code
npm run lint
```

## Architecture Overview

### Backend Architecture

- **FastAPI** application with async/await patterns
- **SQLite** database with custom query utilities in `src/api/utils/db.py`
- **Pydantic** models for request/response validation in `src/api/models.py`
- **Route organization** by feature in `src/api/routes/`
- **Database operations** organized by entity in `src/api/db/`
- **Background jobs** using APScheduler in `src/api/scheduler.py`
- **WebSocket support** for real-time features
- **OpenAI integration** for AI-powered learning features
- **Authentication** via Google OAuth (tokens verified on backend)
- **File upload** handling with S3 and local storage support

### Frontend Architecture

- **Next.js 15** with App Router architecture
- **NextAuth.js** for authentication with Google OAuth
- **TypeScript** throughout with comprehensive type definitions
- **Tailwind CSS** for styling with custom components in `src/components/ui/`
- **Context providers** for global state management
- **API layer** abstraction in `src/lib/api.ts` and `src/lib/server-api.ts`
- **BlockNote** editor for rich text content creation
- **Monaco Editor** for code editing features
- **React PDF** for document viewing

### Key Patterns

- **Database operations**: All database queries go through `execute_db_operation()` utility
- **API communication**: Frontend uses typed API functions, not direct fetch calls
- **Authentication flow**: Google OAuth → NextAuth → Backend token verification
- **Error handling**: Consistent error models and HTTP status codes
- **File organization**: Features grouped by domain (user, course, cohort, etc.)

### Environment Configuration

Backend requires:
- `GOOGLE_CLIENT_ID`
- `OPENAI_API_KEY`
- Optional: S3 credentials, Slack webhooks, Phoenix observability

Frontend requires:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXT_PUBLIC_API_URL` (backend URL)
- Judge0 API configuration for code execution

## Testing

- **Backend**: pytest with async support, coverage reports via `run_tests.sh`
- **Frontend**: Jest + React Testing Library, extensive component test coverage
- **Coverage tracking**: Both projects use Codecov for coverage reporting
- **CI/CD**: GitLab CI integration with automated testing

## Key Development Notes

- Backend uses SQLite with custom async utilities - check existing patterns before adding queries
- Frontend components follow a consistent pattern with TypeScript interfaces
- Authentication is handled differently in frontend (NextAuth) vs backend (token verification)
- File uploads support both local and S3 storage based on environment configuration
- WebSocket connections are used for real-time updates in learning sessions
- AI features integrate with OpenAI API for content generation and student assistance