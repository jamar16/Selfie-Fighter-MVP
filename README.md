# Selfie Fighter

A full-stack AI fighting game. Enter your bio — sports background, skills, hobbies, personality — and Claude builds you a custom 4-move combat moveset. Upload a selfie and Gemini transforms it into an anime fighter portrait. Then battle an AI opponent or challenge a friend in real-time multiplayer.

---

## What it does

1. **Moveset generation** — Fill out a bio form. Claude reads your personality and background and generates 4 moves specific to you, not generic fighting-game filler.
2. **Anime portrait** — Optional selfie upload. Gemini transforms it into a styled anime fighter splash art while keeping your likeness.
3. **vs. CPU** — Fight an AI-generated opponent. Each opponent is invented fresh from a random archetype (scrappy street brawler, stoic samurai, circus acrobat, etc.).
4. **Live PvP** — Create a match, share the room code. Your friend joins, both players pick an attack and a guess each turn. Supabase Realtime syncs both browsers without polling.

---

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express |
| AI (movesets) | Claude API (`claude-opus-4-8`) via `@anthropic-ai/sdk` |
| AI (portraits) | Gemini (`gemini-3.1-flash-image`) via `@google/genai` |
| Structured output | Zod + Claude's `zodOutputFormat` helper |
| Database | Supabase (PostgreSQL + Realtime) |
| Frontend | Vanilla HTML/CSS/JS (no framework) |

---

## How the combat works

Turn-based block/counter system. Each turn, both players simultaneously pick an **attack** and a **guess** (which of the opponent's moves they think is coming):

- **If your guess matches the opponent's signature move** — the attack backfires and damages the attacker instead
- **Unblockable moves** deal full damage regardless of the guess
- **All other attacks** deal 50% damage (defender partially blocks)

Damage values range 5–40. Each moveset has exactly one signature move and at most one unblockable.

---

## Anti-duplication system

When generating a moveset or opponent, the server pulls the last 60 move names from the database and passes them to Claude as a list to avoid. If the returned moves still collide with existing names, it retries once with an expanded avoid list. This keeps the roster feeling fresh across many sessions.

---

## Project structure

```
selfie-fighter-mvp/
├── src/
│   └── server.js          # Express API + all game logic
├── public/
│   ├── index.html         # Bio form + fighter generation
│   ├── combat.html        # vs. CPU battle screen
│   ├── pvp.html           # Real-time multiplayer screen
│   ├── combat.js          # CPU combat client logic
│   ├── pvp.js             # PvP client logic + Supabase Realtime
│   └── style.css
├── supabase/
│   └── schema.sql         # Database + RLS + Realtime setup
├── .env.example
└── package.json
```

---

## Setup

**1. Clone and install**
```bash
git clone https://github.com/jamar16/selfie-fighter.git
cd selfie-fighter
npm install
```

**2. Set up Supabase**
- Create a free project at [supabase.com](https://supabase.com)
- Run `supabase/schema.sql` in the Supabase SQL editor
- Copy your project URL and keys

**3. Configure environment**
```bash
cp .env.example .env
```

Fill in `.env`:
```
ANTHROPIC_API_KEY=your_claude_api_key
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
PORT=3000
```

**4. Run**
```bash
npm start
# → http://localhost:3000
```

Supabase is optional — the game runs without it (no fighter saving, no PvP, no recent fighters list).

---

## API endpoints

| Method | Route | Description |
|---|---|---|
| POST | `/generate-moves` | Generate a 4-move moveset from a bio |
| POST | `/generate-portrait` | Transform a selfie into anime art (multipart) |
| POST | `/generate-opponent` | Invent a random AI opponent |
| POST | `/fighters` | Save a fighter to the database |
| GET | `/fighters/recent` | Load 10 most recent fighters |
| GET | `/fighters/:id` | Get a specific fighter |
| POST | `/matches` | Create a PvP match room |
| POST | `/matches/:id/join` | Join an existing match |
| POST | `/matches/:id/pick` | Submit attack + guess for a turn |
| GET | `/matches/:id` | Get current match state |

---

## Skills demonstrated

- **API integration** — Claude and Gemini APIs wired together, structured output enforced with Zod schema validation
- **Real-time systems** — Supabase Realtime for live multiplayer state sync without raw WebSocket boilerplate
- **Game logic** — Turn-based combat engine with simultaneous picks, counter mechanics, and HP tracking
- **Full-stack Node.js** — REST API design, multipart file uploads with Multer, environment-based feature flags
- **Database design** — PostgreSQL schema, RLS policies, row-level Realtime authorization
