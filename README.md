# SWP391_G5_SanSieuToc_BE

## Setup

1) Install dependencies

```bash
cd BE
npm install
```

2) Create `BE/.env`

```env
MONGO_URI=mongodb://localhost:27017/swp391
PORT=9999
```

## Import seed data

Seed files are stored in the repo-level `db/` folder (Mongo Extended JSON).

From `BE/`:

```bash
node scripts/seedImport.js --drop
```

Notes:
- `--drop` will wipe existing documents in each seeded collection before inserting.
- To use a different MongoDB connection string:

```bash
node scripts/seedImport.js --drop --uri mongodb://localhost:27017/swp391
```

## Run server

```bash
npm run start
```
