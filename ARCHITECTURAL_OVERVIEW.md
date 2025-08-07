# SensAI - Architectural Overview

## High-Level Architecture

SensAI is a comprehensive Learning Management System (LMS) designed for the AI era, built as a **monorepo** containing two main applications:

```
SensAI Platform
├── sensai-ai/ (Python Backend)
└── sensai-frontend/ (Next.js Frontend)
```

### Technology Stack

**Backend (sensai-ai/)**
- **Framework**: FastAPI with async/await patterns
- **Database**: SQLite with WAL mode and custom async utilities
- **Authentication**: Google OAuth token verification
- **AI Integration**: OpenAI API for content generation
- **Real-time**: WebSocket support
- **Background Jobs**: APScheduler for task scheduling
- **Monitoring**: Bugsnag error tracking, Phoenix observability
- **File Storage**: Local filesystem + AWS S3 support
- **Language**: Python 3.13+

**Frontend (sensai-frontend/)**
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript with strict typing
- **Authentication**: NextAuth.js with Google OAuth
- **Styling**: Tailwind CSS + Radix UI components
- **State Management**: React Context patterns
- **Rich Text**: BlockNote editor for content creation
- **Code Editing**: Monaco Editor integration
- **Document Viewing**: React PDF for document display

## Backend Architecture

### Core Structure

```
sensai-ai/src/api/
├── main.py          # FastAPI app configuration & middleware
├── config.py        # Database tables, paths, AI model configs
├── settings.py      # Environment variable management
├── models.py        # Pydantic request/response models
├── routes/          # API endpoints organized by feature
├── db/              # Database operations by entity
├── utils/           # Shared utilities (db, logging, s3, etc.)
└── websockets.py    # Real-time WebSocket handlers
```

### Key Patterns

**Database Operations**
- All queries use the centralized `execute_db_operation()` utility in `utils/db.py`
- SQLite with WAL journaling mode for concurrent access
- Async/await throughout with `aiosqlite`
- Database connection pooling via context managers

**API Structure**
- Route organization by domain (user, course, cohort, task, etc.)
- Consistent Pydantic models for validation
- Standardized error handling with HTTP status codes
- Background job processing with APScheduler

**Authentication Flow**
- Google OAuth tokens validated on each request
- User session management through database
- Organization-based access control

### Database Schema Highlights

Key entities include:
- `users` - User accounts and profiles
- `organizations` - Schools/institutions
- `cohorts` - Student groups within organizations
- `courses` - Learning content structure
- `tasks` - Individual learning activities
- `chat_history` - AI conversation logs
- `task_completions` - Student progress tracking

### AI Integration

- **OpenAI Models**: Configurable model selection (o3-mini, GPT-4.1, etc.)
- **Content Generation**: Automated course and task creation
- **Student Assistance**: AI-powered chat support
- **Background Processing**: Async job queues for AI operations

## Frontend Architecture

### Core Structure

```
sensai-frontend/src/
├── app/             # Next.js 15 App Router pages
├── components/      # Reusable React components
├── lib/             # API client, utilities, auth helpers
├── types/           # TypeScript interfaces
├── context/         # React context providers
└── providers/       # Session and theme providers
```

### Key Components

**Authentication & Authorization**
- NextAuth.js integration with Google OAuth
- Session management with JWT tokens
- Protected route patterns via middleware

**UI Components**
- Comprehensive component library built on Radix UI
- Consistent design system with Tailwind CSS
- Responsive layouts for mobile and desktop

**API Communication**
- Typed API client in `lib/api.ts` and `lib/server-api.ts`
- Server-side and client-side data fetching patterns
- Error handling with toast notifications

**Rich Content Editing**
- BlockNote editor for course content creation
- Monaco Editor for code editing tasks
- PDF viewing capabilities for learning materials

### State Management

- React Context for global state (user session, editor state)
- Local state management with React hooks
- Form handling with controlled components

## Main Modules & Features

### User Management
- **Registration**: Google OAuth signup flow
- **Profiles**: User information and preferences
- **Organizations**: Multi-tenant school/institution support
- **Roles**: Learners, mentors, admins, owners

### Course Management
- **Course Creation**: AI-assisted content generation
- **Module Structure**: Hierarchical learning content
- **Task Types**: Learning materials, quizzes, coding exercises
- **Publishing**: Drip publishing and scheduling

### Learning Experience
- **Interactive Tasks**: Rich content with multimedia support
- **Progress Tracking**: Completion status and scoring
- **AI Chat**: Contextual learning assistance
- **Leaderboards**: Gamification and motivation

### Assessment & Analytics
- **Scorecards**: Performance evaluation
- **Badges**: Achievement system
- **Analytics**: Usage tracking and insights
- **Reporting**: Progress and performance metrics

## Setup Requirements & Configuration

### Backend Setup

**Prerequisites**
```bash
# Python 3.13+ required
virtualenv -p python3.13 venv
source venv/bin/activate

# System dependencies
# Ubuntu: sudo apt-get install ffmpeg poppler-utils
# macOS: brew install ffmpeg poppler
```

**Environment Variables** (`.env`)
```
OPENAI_API_KEY=<required>
GOOGLE_CLIENT_ID=<required>
S3_BUCKET_NAME=<optional-for-prod>
BUGSNAG_API_KEY=<optional>
SLACK_*_WEBHOOK_URL=<optional>
PHOENIX_*=<optional-for-observability>
```

**Database Initialization**
```bash
cd src && python startup.py
```

### Frontend Setup

**Environment Variables**
```
GOOGLE_CLIENT_ID=<required>
GOOGLE_CLIENT_SECRET=<required>
NEXTAUTH_SECRET=<required>
NEXT_PUBLIC_API_URL=<backend-url>
JUDGE0_API_URL=<optional-for-code-execution>
```

**Development**
```bash
npm ci
npm run dev
```

## Setup Quirks & Special Considerations

### Backend Considerations

1. **Python Version**: Requires Python 3.13+ specifically
2. **System Dependencies**: FFmpeg and Poppler must be installed for media/PDF processing
3. **Database**: SQLite WAL mode requires proper file permissions
4. **AI Models**: OpenAI model selection is configurable via `config.py`
5. **File Storage**: Supports both local and S3 storage based on environment
6. **Background Jobs**: APScheduler requires proper cleanup on shutdown

### Frontend Considerations

1. **Canvas Module**: Uses empty module alias for PDF.js canvas compatibility
2. **Build Configuration**: TypeScript and ESLint errors ignored for production builds
3. **Telemetry**: Next.js telemetry disabled for privacy
4. **Standalone Output**: Configured for containerized deployments
5. **Turbopack**: Uses Turbopack for development builds

### Development Workflow

**Testing**
```bash
# Backend
./run_tests.sh  # Runs pytest with coverage

# Frontend  
npm run test:ci  # Jest with coverage reporting
```

**Docker Setup**
- Both applications containerized with multi-stage builds
- Development and production docker-compose configurations
- Health checks implemented for service dependencies

### Performance Characteristics

- **Database**: SQLite handles ~10k+ queries efficiently with proper indexing
- **AI Integration**: Async processing prevents UI blocking
- **Frontend**: Next.js SSR/SSG for optimal performance
- **Real-time**: WebSocket connections for live updates

## Security Features

- **Authentication**: OAuth2 with Google
- **Authorization**: Multi-tenant with role-based access
- **Data Validation**: Pydantic models prevent injection attacks  
- **Error Tracking**: Bugsnag for production monitoring
- **CORS**: Configured for cross-origin API access

## Scalability Considerations

- **Database**: SQLite suitable for small-medium deployments, migration path to PostgreSQL available
- **File Storage**: S3 integration for scalable file handling
- **Background Jobs**: APScheduler supports distributed processing
- **Frontend**: Next.js supports horizontal scaling
- **Observability**: Phoenix integration for performance monitoring

This architecture supports a modern, AI-powered educational platform with strong separation of concerns, comprehensive testing, and production-ready deployment capabilities.