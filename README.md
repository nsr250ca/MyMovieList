# Movie Journal

A private Next.js movie diary for importing `2011Movies.xlsx`, searching watched movies, adding future watches, and matching titles against TMDB metadata.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project and run the SQL in `supabase/migrations/202609200001_initial_movie_journal.sql`.

3. Copy `.env.example` to `.env.local` and fill in:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   TMDB_ACCESS_TOKEN=
   ```

   `SUPABASE_SERVICE_ROLE_KEY` is reserved for admin/server scripts and is not exposed to the browser.

4. Start locally:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`, sign up or sign in, then use `/import` to parse the included workbook.

## Notes

- TMDB data is cached in Supabase after a match is accepted.
- The UI includes TMDB attribution. Keep it visible if TMDB posters or metadata are shown.
- All user-owned tables have RLS policies scoped by `auth.uid()`.
