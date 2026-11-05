# Hostel Management System

A responsive hostel administration application built with React, Express, and MySQL. Administrators can manage students, rooms, room allocations, and payments through a JWT-protected dashboard. The frontend and backend are separate Docker images; Docker Compose runs them with MySQL on a private bridge network.

> **Local demo credentials:** `admin@hostel.local` / `ChangeThisAdminPassword123!`. These defaults are only for a local demo. Replace them and the other secrets before exposing the application beyond your computer.

## Features

- Administrator sign-in with bcrypt-compatible password hashing (`bcryptjs`) and expiring JWTs.
- Live dashboard metrics and recent activity read from MySQL.
- Student and room create, view, update, delete, and search.
- Capacity-checked room allocation, room moves, and vacating.
- Payment recording, history, editing, and deletion. Paid/Partial/Unpaid status is calculated from monthly room fees and recorded payments.
- Responsive layouts, confirmation prompts, and success/error notifications.
- MySQL initialization script with related tables, constraints, and demo records.
- Separate frontend and backend Dockerfiles, Nginx API reverse proxy, health checks, and persistent MySQL volume.

## Technologies and architecture

```text
Browser
  └── React + Vite (served by Nginx, port 8080)
        └── /api/* reverse proxy
              └── Express REST API (port 5000)
                    └── MySQL 8 (service name: mysql, port 3306)
```

The browser sends API calls to the same origin under `/api`. In production, Nginx forwards those calls to the `backend` Compose service; the API connects to MySQL using the Compose DNS name `mysql`.

## Project structure

```text
Hostel_Management_System/
├── backend/
│   ├── config/db.js
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── utils/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── database/init.sql
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── vite.config.js
├── .env.example
├── docker-compose.yml
└── README.md
```

## Database design

The MySQL database is named `hostel_management`. `database/init.sql` creates:

- `admins`: administrator email and bcrypt password hash.
- `students`: registration details; registration number and non-null email are unique.
- `rooms`: unique room number, capacity, and monthly price.
- `allocations`: student/room history; active allocations have `vacated_at IS NULL`.
- `payments`: student payment amount, date, and method.

Foreign keys preserve relationships. Student deletion cascades to their allocations and payments; a room with allocation history cannot be deleted. The API prevents active duplicate allocations and uses database transactions/row locks to enforce room capacity. Compose mounts the SQL file into the MySQL initialization directory; the image runs it automatically when the database volume is first created. MySQL initialization scripts do not rerun on an already initialized volume.

The backend creates the configured administrator on first startup if the email does not exist. It hashes the password using bcrypt; changing `ADMIN_PASSWORD` later does not automatically reset an existing admin password.

## Configuration

Docker Compose has local-demo defaults, so you can start it without creating a `.env` file. To customize them, create your local environment file in PowerShell:

```powershell
Copy-Item .env.example .env
```

For a local demo, the example values work as-is. Before exposing the app beyond your computer, set unique values for `DB_ROOT_PASSWORD`, `DB_PASSWORD`, `JWT_SECRET` (at least 32 random characters), and `ADMIN_PASSWORD`. Never commit `.env`. Optional settings include `FRONTEND_PORT` (default `8080`), `BACKEND_PORT` (default `5000`), and `DOCKERHUB_USERNAME`.

## Run with Docker Compose (recommended)

From the project root:

```powershell
# Optional: Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs -f backend
```

Open [http://localhost:8080](http://localhost:8080) (or the configured `FRONTEND_PORT`). The backend health endpoint is [http://localhost:5000/api/health](http://localhost:5000/api/health); it reports success only when MySQL is reachable. The frontend waits for the healthy backend, and the backend waits for healthy MySQL.

Sign in with `admin@hostel.local` / `ChangeThisAdminPassword123!`. These are public demo credentials; do not use them on a publicly accessible deployment.

Useful Compose commands:

```powershell
docker compose logs -f
docker compose stop
docker compose start
docker compose down
docker compose down -v   # DELETES the persistent database volume and its data
```

`docker compose down` preserves the named `mysql_data` volume. Use `down -v` only when intentionally resetting the database. Demo students, rooms, an allocation, and a payment are inserted by the initial SQL script.

## Run locally without Docker

1. Start a MySQL 8 server and create the database and application user (or use credentials with permission to create tables).
2. From the project root, load `database/init.sql` into the `hostel_management` database (the database and MySQL user must already exist):

   ```powershell
   Get-Content .\database\init.sql -Raw | mysql --host=127.0.0.1 --port=3306 --user=hostel_app --password hostel_management
   ```

   Enter the MySQL password when prompted. If your MySQL user has a different name, replace `hostel_app` with the configured `DB_USER`.
3. Configure `PORT=5000`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_NAME=hostel_management`, `DB_USER=hostel_app`, `DB_PASSWORD=<your-db-password>`, `JWT_SECRET=<random-secret>`, `ADMIN_EMAIL=admin@hostel.local`, and `ADMIN_PASSWORD=<your-admin-password>` in `.env` at the project root or in `backend\.env`. The backend loads `backend\.env` when present, otherwise the project-root `.env`. Use `DB_PASSWORD=` only if the MySQL account is configured with no password.
4. Start the API:

   ```powershell
   Set-Location backend
   npm install
   npm run dev
   ```

5. In another terminal, start the frontend:

   ```powershell
   Set-Location frontend
   npm install
   npm run dev
   ```

Open the Vite address (normally [http://localhost:5173](http://localhost:5173)). Vite proxies `/api` requests to `http://localhost:5000`; set `VITE_API_PROXY_TARGET` if the API runs elsewhere.

## REST API

All endpoints except health and login require `Authorization: Bearer <JWT>`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | API and MySQL health |
| POST | `/api/auth/login` | Administrator login |
| GET | `/api/auth/me` | Current token identity |
| GET | `/api/dashboard` | Live summary and recent activities |
| GET, POST | `/api/students` | List/search (`?search=`), create |
| PUT, DELETE | `/api/students/:id` | Update or delete |
| GET, POST | `/api/rooms` | List with capacity status, create |
| PUT, DELETE | `/api/rooms/:id` | Update or delete |
| GET, POST | `/api/allocations` | List history, allocate a student |
| PUT | `/api/allocations/:id/move` | Move an active allocation |
| PUT | `/api/allocations/:id/vacate` | End an active allocation |
| GET, POST | `/api/payments` | List history, record a payment |
| PUT, DELETE | `/api/payments/:id` | Update or delete a payment |

The room API reports `Available` when no beds are occupied, `Occupied` when partly occupied, and `Full` at capacity. Allocation dates and payment dates are `YYYY-MM-DD`.

## Docker image build and run

Compose builds both services with the separate Dockerfiles. To build each image manually from the project root:

```powershell
docker build -t hostel-backend:local .\backend
docker build -t hostel-frontend:local .\frontend
```

For manual standalone `docker run`, containers must share a Docker network and MySQL must be reachable as `mysql`. Compose is recommended because it also configures initialization, persistent storage, dependencies, health checks, and Nginx networking.

## Publish images to Docker Hub

Replace `YOUR_DOCKERHUB_USERNAME` with your Docker Hub account name. Create the two repositories first:

- `https://hub.docker.com/r/YOUR_DOCKERHUB_USERNAME/hostel-frontend`
- `https://hub.docker.com/r/YOUR_DOCKERHUB_USERNAME/hostel-backend`

PowerShell commands:

```powershell
docker login

docker build -t YOUR_DOCKERHUB_USERNAME/hostel-frontend:latest .\frontend
docker build -t YOUR_DOCKERHUB_USERNAME/hostel-backend:latest .\backend

docker push YOUR_DOCKERHUB_USERNAME/hostel-frontend:latest
docker push YOUR_DOCKERHUB_USERNAME/hostel-backend:latest
```

Optional versioned tags:

```powershell
docker tag YOUR_DOCKERHUB_USERNAME/hostel-frontend:latest YOUR_DOCKERHUB_USERNAME/hostel-frontend:1.0.0
docker tag YOUR_DOCKERHUB_USERNAME/hostel-backend:latest YOUR_DOCKERHUB_USERNAME/hostel-backend:1.0.0
docker push YOUR_DOCKERHUB_USERNAME/hostel-frontend:1.0.0
docker push YOUR_DOCKERHUB_USERNAME/hostel-backend:1.0.0
```

## Pull and run the published images

After publishing, put your actual Docker Hub username in `.env` as `DOCKERHUB_USERNAME=your-dockerhub-username`. Keep your database and JWT settings in the same file. Then:

```powershell
docker compose pull
docker compose up -d --no-build
docker compose ps
```

The Compose services use the images `${DOCKERHUB_USERNAME}/hostel-frontend:latest` and `${DOCKERHUB_USERNAME}/hostel-backend:latest`. MySQL remains the official MySQL 8 image, with the same environment variables, init script, health dependencies, network, and named persistent volume.

To explicitly pull the two published images:

```powershell
docker pull YOUR_DOCKERHUB_USERNAME/hostel-frontend:latest
docker pull YOUR_DOCKERHUB_USERNAME/hostel-backend:latest
```

For a standalone manual run, first create a Docker network and volume, start MySQL with the database credentials and initialization SQL, and start the backend with `DB_HOST=mysql`, then start the frontend on that network. In normal use, `docker compose pull` / `docker compose up -d --no-build` is the safer exact run configuration.

## Testing and verification

Check service health and container status:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:5000/api/health
```

Sign in through the web UI, add a student and a room, allocate the student, record a payment, and confirm the dashboard and tables update. To verify persistence, restart services without deleting the volume:

```powershell
docker compose restart
docker compose ps
```

The data should remain because it is stored in the `mysql_data` named volume. Do not use `docker compose down -v` for this persistence check.

Frontend production build:

```powershell
Set-Location frontend
npm ci
npm run build
```

Backend dependency/startup check with Docker is covered by `docker compose up --build`; its health check verifies a database query via `/api/health`.

## Assignment screenshot checklist

- [ ] Docker Hub page showing both published repositories and image tags.
- [ ] `docker compose ps` showing frontend, backend, and MySQL healthy/running.
- [ ] Browser showing the sign-in page and then the dashboard with live database totals.
- [ ] Student management list and the add/edit student form.
- [ ] Room list showing Available, Occupied, or Full status.
- [ ] Allocation list and a successful room allocation or move.
- [ ] Payment history with a Paid/Partial/Unpaid status.
- [ ] `/api/health` response showing `status: ok` and `database: connected`.
- [ ] Container restart followed by the same records still appearing.
