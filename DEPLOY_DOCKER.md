# Hina WMS - Docker Deployment Guide

## Docker Images

| Service | Image | Tag |
|---------|-------|-----|
| Backend | `roll249/hina-wms-backend` | `latest` |
| Frontend | `roll249/hina-wms-frontend` | `latest` |

## Quick Deploy (Pull & Run)

### 1. Prerequisites

```bash
# Install Docker & Docker Compose
# Create shared network (must match e-comm network)
docker network create hina-network

# Create .env file
cp .env.standalone .env
# Edit .env with your actual values
```

### 2. Apply Database Migration

Before starting WMS, apply the WMS tables to your shared database:

```bash
# Connect to your postgres and run migration
docker exec -i <postgres-container> psql -U <user> -d <database> < backend/prisma/migrations/20260616100000_wms_init/migration.sql

# Apply remaining migrations
docker exec -i <postgres-container> psql -U <user> -d <database> < backend/prisma/migrations/20260617030000_add_product_is_classified/migration.sql
docker exec -i <postgres-container> psql -U <user> -d <database> < backend/prisma/migrations/20260617110000_add_inventory_web_stock_fields/migration.sql
docker exec -i <postgres-container> psql -U <user> -d <database> < backend/prisma/migrations/20260617120000_add_order_source_and_hidden/migration.sql
```

### 3. Pull Images

```bash
docker pull roll249/hina-wms-backend:latest
docker pull roll249/hina-wms-frontend:latest
```

### 4. Run

```bash
# Using docker-compose
docker-compose -f docker-compose.standalone.yml up -d

# Or manually with docker run
docker run -d \
  --name hina-wms-backend \
  --network hina-network \
  -p 7777:7777 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e REDIS_URL="redis://:pass@host:6379" \
  -e JWT_SECRET="your-secret" \
  roll249/hina-wms-backend:latest

docker run -d \
  --name hina-wms-frontend \
  --network hina-network \
  -p 4568:4568 \
  -e NEXT_PUBLIC_API_URL=http://localhost:7777 \
  roll249/hina-wms-frontend:latest
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Backend API | 7777 | NestJS API |
| Frontend | 4568 | Next.js Admin UI |

## Default Credentials

After deploy, create a WMS staff user:

```sql
-- 1. Create user in User table (if not exists)
INSERT INTO "User" (id, email, name, password, role, "isActive", "permissionMask", "approvedAt", "createdAt", "updatedAt")
VALUES ('admin-001', 'admin@yourdomain.com', 'Admin', '<bcrypt_hash>', 'ADMIN', true, 0, NOW(), NOW(), NOW());

-- 2. Link to WarehouseStaff
INSERT INTO "WarehouseStaff" (id, "userId", "employeeCode", "warehouseId", "pinHash", "isActive", "createdAt", "updatedAt")
VALUES ('ws-001', 'admin-001', 'WS-001', 'wh-default-0001', '<bcrypt_hash_of_pin>', true, NOW(), NOW());
```

Login at: http://localhost:4568
- Employee Code: `WS-001`
- PIN: `123456`

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_SECRET` | Must match e-comm JWT_SECRET | Yes |
| `WEBHOOK_SECRET` | For e-comm webhook events | Yes |
| `MINIO_*` | MinIO/S3 config for file uploads | Yes |
| `NEXT_PUBLIC_API_URL` | Backend API URL | Yes |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                         │
│                    (hina-network)                        │
│                                                         │
│  ┌─────────────┐      ┌─────────────┐                  │
│  │ WMS Backend │──────│ E-comm DB   │                  │
│  │   :7777     │      │  (shared)   │                  │
│  └──────┬──────┘      └─────────────┘                  │
│         │                                                 │
│  ┌──────┴──────┐                                        │
│  │ WMS Frontend│                                        │
│  │   :4568     │                                        │
│  └─────────────┘                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Troubleshooting

### Backend unhealthy
```bash
# Check logs
docker logs hina-wms-backend

# Check health endpoint
curl http://localhost:7777/health
```

### Cannot connect to database
- Verify `DATABASE_URL` is correct
- Check postgres container is on same network
- Verify database exists and user has permissions

### Cannot login to WMS
- Create WarehouseStaff record first (see above)
- PIN must be 4-6 digits

## Update to Latest

```bash
docker pull roll249/hina-wms-backend:latest
docker pull roll249/hina-wms-frontend:latest
docker-compose -f docker-compose.standalone.yml up -d
```
