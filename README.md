# Event Aggregator (Directus)

This project is a headless CMS setup using [Directus](https://directus.io/) to aggregate, store, and expose event data. It provides a visual Admin UI, a REST API for JSON data, and a custom extension for exporting `.ics` (iCal) feeds.

##  Getting Started

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose installed
- Git
- npm

### Local Setup
1. Clone the repository and navigate into the folder:
   ```bash
   git clone https://github.com/nicocalu/directus-aggregator.git
   cd event-aggregator
   ```
2. Start the database and Directus containers:
   ```bash
   docker compose up -d
   ```
3. Apply the latest database schema (tables and fields) from the repository:
   ```bash
   docker compose exec directus npx directus schema apply ./schema.yaml -y
   ```
4. Open Directus in your browser: **http://localhost:8055**
   - **User:** `admin@example.com`
   - **Password:** `password`

---

## Team Workflow (Git Pipeline)

Because Directus stores table structures in the database, we use the **Schema Sync** feature to share database changes via Git.

### When YOU make a change to the database:
If you use the Admin UI to create a new Collection or add a new Field, you must export the state before committing:
```bash
# 1. Export your local database structure to the YAML file
docker compose exec directus npx directus schema snapshot ./schema.yaml

# 2. Commit and push to Git
git add schema.yaml
git commit -m "Added ticket_price field to events collection"
git push
```

### When SOMEONE ELSE makes a change:
When you pull new code from Git, update your local database to match the new `schema.yaml`:
```bash
# 1. Pull the latest code
git pull

# 2. Apply the schema changes to your local database
docker compose exec directus npx directus schema apply ./schema.yaml
```
*Note: This will safely update your tables/fields without deleting your local test data.*

### !!! Important: Roles & Permissions are Data, not Schema !!!
The `schema.yaml` file tracks Collections, Fields, and Relationships. It **does not track Data**, and Directus considers Roles, Users, and Permissions as data. If you create a new user or change API access rules, you must manually communicate this to the team or apply it manually on the staging/production server.

---

##  Project Architecture

### 1. The Core (Directus)
Directus sits on top of a PostgreSQL database. It automatically generates a REST/GraphQL API based on the tables we create.
- **REST API Endpoint:** `http://localhost:8055/items/events`

### 2. Custom Extensions (The iCal Feed)
Directus outputs JSON by default. To support Calendar apps, we wrote a custom Node.js endpoint.
- **Code Location:** `extensions/endpoints/ical/index.js`
- **iCal Feed URL:** `http://localhost:8055/ical`
*If you modify extension code, you must restart the container to see changes: `docker compose restart directus`*

### 3. Ingestors (Push Architecture)
Ingestors should be written in the folder `ingestors/`

**How to write an Ingestor:**
1. Fetch data from your target source.
2. Transform it to match our JSON structure.
3. Send a `POST` request to `http://localhost:8055/items/events` using a token.

**Target Payload Format:**
```json
{
  "name": "Jam Kfet (UDDJ)",
  "startDate": "2026-04-29T18:00:24.000Z",
  "endDate": "2026-04-29T22:00:00.000Z",
  "categories": ["Soirée", "Spectacle"],
  "description": "Long text with \n supported",
  "geo": { "lat": 45.783832, "lon": 4.874081 },
  "location": "Rotonde - salle de spectacle",
  "source": "Source Name" // this ideally should be your wrapper/ingestor name
}
```

---

## 📂 Folder Structure
```text
event-aggregator/
├── docker-compose.yml       # Docker config
├── .gitignore               # Ignores database volumes and secrets
├── schema.yaml              # The synced database schema (Collections & Fields)
└── extensions/              # Custom Directus plugins (Node.js)
    └── endpoints/           # Custom API routes (e.g., the /ical endpoint)
```
