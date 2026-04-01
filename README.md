# Tech Reels

A comprehensive NestJS-based backend platform for creating, sharing, and discovering educational video content (reels) with gamification, skill paths, and community challenges.

## 🎯 Overview

Tech Reels is an educational platform designed to deliver short-form video content (reels) with integrated gamification elements. Users can:

- Create and share educational reels
- Learn through structured skill paths
- Participate in challenges to earn XP and badges
- Build streaks and maintain learning consistency
- Discover content through intelligent feed recommendations
- Interact with community members through ratings and feedback

## ✨ Features

### Core Features

- **User Management**
  - Account creation and management
  - OAuth integration support
  - Role-based access control (Admin, User)
  - Account status management (Active, Inactive, Suspended)

- **Reels System**
  - Upload and process video content
  - Support for high-quality video encoding via AWS MediaConvert
  - Reel metadata and descriptions
  - User interactions (likes, saves, bookmarks)

- **Gamification**
  - XP (Experience Points) system with ledger tracking
  - Badge achievements and unlockable milestones
  - Streak tracking for consistent engagement
  - Streak freeze mechanism for flexibility

- **Skill Paths**
  - Structured learning paths
  - Progress tracking through skill path completion
  - Prerequisites and dependencies

- **Challenges**
  - Timed and open-ended challenges
  - Attempt tracking and scoring
  - Rewards and badges upon completion

- **Tagging System**
  - Flexible tagging for content categorization
  - Topic-based affinity tracking
  - Tag relationships and hierarchies

- **Feed & Discovery**
  - Personalized feed recommendations
  - Topic affinity-based content delivery
  - Cursor-based pagination for infinite scroll

- **Content Moderation**
  - Report system for user-generated content
  - Trust score calculation for reporters
  - Content moderation workflows

### Technical Features

- **Authentication & Authorization**
  - JWT-based authentication
  - Global JWT auth guard with opt-out capability
  - Role-based access control (RBAC)

- **Performance & Scalability**
  - Redis caching layer
  - BullMQ for asynchronous task processing
  - Queue-based job processing
  - Database connection pooling

- **API Features**
  - RESTful API with consistent response formats
  - Pagination support (cursor-based and offset-based)
  - Comprehensive error handling with RFC 7807 error responses
  - Swagger/OpenAPI documentation

- **Infrastructure**
  - Docker support for easy deployment
  - Database migrations system
  - AWS S3 for media storage
  - AWS MediaConvert for video processing
  - Redis for caching and queues

## 🛠️ Tech Stack

### Backend Framework
- **NestJS** - Progressive Node.js framework
- **TypeScript** - Type-safe development

### Databases & Caching
- **PostgreSQL** - Primary data store
- **Redis** (Redis Stack) - Caching and message broker
- **BullMQ** - Job queue system

### Authentication
- **Passport.js** - Authentication middleware
- **JWT** - Token-based authentication
- **bcrypt** - Password hashing

### Cloud Services
- **AWS S3** - Media storage
- **AWS MediaConvert** - Video processing and encoding

### API Documentation
- **Swagger/OpenAPI** - Interactive API documentation

### Development Tools
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Jest** - Testing framework
- **TypeORM/Knex** - Database ORM/query builder

## 📁 Project Structure

```
Tech_Reels/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── app.module.ts           # Root module
│   ├── app.controller.ts       # Root controller
│   ├── app.service.ts          # Root service
│   │
│   ├── common/                 # Shared utilities & infrastructure
│   │   ├── constants/          # Application constants
│   │   ├── decorators/         # Custom decorators (@CurrentUser, @Roles, etc)
│   │   ├── dto/                # Shared DTOs
│   │   ├── exceptions/         # Custom exceptions
│   │   ├── filters/            # Exception filters
│   │   ├── guards/             # Route guards (JWT, RBAC, Rate Limit, IP Whitelist)
│   │   ├── interceptors/       # Global interceptors (logging)
│   │   ├── pipes/              # Validation pipes
│   │   └── utils/              # Helper utilities
│   │
│   ├── config/                 # Configuration modules
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── jwt.config.ts
│   │   ├── redis.config.ts
│   │   └── s3.config.ts
│   │
│   ├── database/               # Database layer
│   │   ├── database.module.ts
│   │   ├── database.service.ts
│   │   └── migrations/         # Database migrations
│   │
│   ├── modules/                # Feature modules
│   │   ├── auth/               # Authentication
│   │   ├── users/              # User management
│   │   ├── reels/              # Video reels system
│   │   ├── media/              # Media handling & uploads
│   │   ├── tags/               # Tagging system
│   │   ├── challenges/         # Challenges & attempts
│   │   ├── gamification/       # XP, badges, streaks
│   │   ├── skill-paths/        # Learning paths
│   │   └── feed/               # Feed & recommendations
│   │
│   ├── queues/                 # Job queue configuration
│   ├── redis/                  # Redis integration
│   └── s3/                     # AWS S3 integration
│
├── test/                       # E2E tests
├── scripts/                    # Utility scripts
│   ├── generate-keys.js        # JWT key generation
│   └── seed-admin.ts           # Admin user seeding
│
├── docker-compose.yml          # Docker services configuration
├── database.json               # Database migration config
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript configuration
└── nest-cli.json               # NestJS CLI configuration
```

## 📦 Prerequisites

- **Node.js** >= 18.x
- **npm** or **yarn**
- **Docker** and **Docker Compose** (for containerized setup)
- **PostgreSQL** 16+ (or use Docker)
- **Redis** (or use Docker)

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Tech_Reels
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Generate JWT Keys (Optional)

If you need to generate new JWT keys:

```bash
npm run generate:keys
```

This generates `private.key` and `public.key` files.

## ⚙️ Configuration

### Environment Variables

Create environment configuration files based on your deployment environment:

- `.env.development` - Development environment
- `.env.production` - Production environment
- `.env.test` - Testing environment

### Key Environment Variables

```env
# App
NODE_ENV=development
APP_PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5433/tech_reel
DATABASE_HOST=localhost
DATABASE_PORT=5433
DATABASE_USER=postgres
DATABASE_PASSWORD=password
DATABASE_NAME=tech_reel

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRY=24h

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name

# AWS MediaConvert
AWS_MEDIACONVERT_ROLE_ARN=arn:aws:iam::account-id:role/role-name
AWS_MEDIACONVERT_QUEUE_ARN=arn:aws:mediaconvert:region:account-id:queues/queue-name
```

## 🏃 Running the Application

### Development Mode

```bash
# Start with auto-reload
npm run start:dev

# Start with debugging
npm run start:debug
```

The API will be available at `http://localhost:3000/api/v1`
The Swagger docs will be available at `http://localhost:3000/api/v1/docs`

### Production Mode

```bash
# Build the application
npm run build

# Start production server
npm run start:prod
```

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

This will start:
- PostgreSQL on port 5433
- Redis on port 6379

## 🗄️ Database Migrations

### Run Migrations

```bash
# Run pending migrations
npm run migrate

# Rollback last migration
npm run migrate:down

# Create new migration
npm run migrate:create -- --name migration_name
```

Migrations are stored in `src/database/migrations/` and use the naming convention `##_description.js`.

### Seed Database

To seed an admin user:

```bash
npm run seed:admin
```

## 📚 API Documentation

Swagger documentation is automatically generated and available at:

```
http://localhost:3000/api/v1/docs
```

The API follows these patterns:
- **Base URL**: `/api/v1`
- **Authentication**: Bearer token in `Authorization` header
- **Response Format**: JSON with consistent error structures (RFC 7807)

### Key Endpoints

- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /users/me` - Current user info
- `POST /reels` - Create a reel
- `GET /feed` - Get personalized feed
- `POST /challenges` - Create a challenge
- `GET /gamification/xp` - Get XP leaderboard


## 🐳 Docker

### Docker Compose Services

The `docker-compose.yml` provides:

1. **PostgreSQL** - Database service
   - Image: postgres:16-alpine
   - Port: 5433
   - Database: tech_reel

2. **Redis** - Cache and message broker
   - Image: redis/redis-stack:latest
   - Port: 6379


## 🔐 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - bcrypt for secure password storage
- **Rate Limiting** - Guards against brute force attacks
- **IP Whitelisting** - Optional IP-based access control
- **Role-Based Access Control** - Fine-grained permission management
- **HMAC Validation** - For webhook security (media processing)
- **Global Exception Handling** - Consistent error responses without leaking sensitive data

## 📊 Architecture Highlights

### Modular Design
Each feature module (auth, users, reels, etc.) is self-contained with:
- Service layer for business logic
- Controller layer for HTTP handling
- DTOs for data validation and transformation
- Repository patterns for data access

### Dependency Injection
NestJS dependency injection container manages all service dependencies, promoting loose coupling and testability.

### Middleware Layers
- **Global Pipes**: Validation using class-validator
- **Global Filters**: Centralized error handling
- **Global Interceptors**: Logging and cross-cutting concerns
- **Global Guards**: Authentication and authorization

---

**Last Updated**: March 2026