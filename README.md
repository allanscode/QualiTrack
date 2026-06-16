# QualiTrack

Sistema de gestão de qualidade para operações de suporte ao cliente.

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   `npm install`
2. Configure Supabase (or use Mock Mode):
   - Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   - If not configured, the app runs in **Mock Mode** (localStorage)
3. Run the app:
   `npm run dev` → http://localhost:3001

## NPM Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server (port 3001) |
| `npm run build` | Production build |
| `npm run lint` | Type checking (tsc --noEmit) |
| `npm run test` | Run tests (vitest) |
| `npm run preview` | Preview production build |

## Documentation

See `docs/` for full documentation. Start with `docs/onboarding/dev-setup.md`.
