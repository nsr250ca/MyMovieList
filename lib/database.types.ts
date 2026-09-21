export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      import_batches: {
        Row: {
          id: string;
          user_id: string;
          source_name: string;
          status: "parsed" | "committed" | "failed";
          parsed_count: number;
          committed_count: number;
          warning_count: number;
          warnings: Json;
          created_at: string;
          committed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_name: string;
          status?: "parsed" | "committed" | "failed";
          parsed_count?: number;
          committed_count?: number;
          warning_count?: number;
          warnings?: Json;
          created_at?: string;
          committed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["import_batches"]["Insert"]>;
        Relationships: [];
      };
      movies: {
        Row: {
          id: string;
          user_id: string;
          display_title: string;
          normalized_title: string;
          original_title: string | null;
          english_title: string | null;
          tmdb_id: number | null;
          tmdb_poster_path: string | null;
          tmdb_backdrop_path: string | null;
          overview: string | null;
          release_date: string | null;
          runtime_minutes: number | null;
          original_language: string | null;
          genres: Json;
          directors: Json;
          cast_members: Json;
          match_status: "unmatched" | "suggested" | "accepted" | "rejected" | "manual";
          match_confidence: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_title: string;
          normalized_title: string;
          original_title?: string | null;
          english_title?: string | null;
          tmdb_id?: number | null;
          tmdb_poster_path?: string | null;
          tmdb_backdrop_path?: string | null;
          overview?: string | null;
          release_date?: string | null;
          runtime_minutes?: number | null;
          original_language?: string | null;
          genres?: Json;
          directors?: Json;
          cast_members?: Json;
          match_status?: "unmatched" | "suggested" | "accepted" | "rejected" | "manual";
          match_confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["movies"]["Insert"]>;
        Relationships: [];
      };
      watch_entries: {
        Row: {
          id: string;
          user_id: string;
          movie_id: string;
          watched_on: string | null;
          source_title: string;
          source_sheet: string | null;
          source_row: number | null;
          source_slot: string | null;
          import_batch_id: string | null;
          rating: number | null;
          platform: string | null;
          notes: string | null;
          is_rewatch: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          movie_id: string;
          watched_on?: string | null;
          source_title: string;
          source_sheet?: string | null;
          source_row?: number | null;
          source_slot?: string | null;
          import_batch_id?: string | null;
          rating?: number | null;
          platform?: string | null;
          notes?: string | null;
          is_rewatch?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["watch_entries"]["Insert"]>;
        Relationships: [];
      };
      movie_match_candidates: {
        Row: {
          id: string;
          user_id: string;
          movie_id: string;
          tmdb_id: number;
          title: string;
          original_title: string | null;
          release_date: string | null;
          poster_path: string | null;
          original_language: string | null;
          score: number;
          payload: Json;
          accepted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          movie_id: string;
          tmdb_id: number;
          title: string;
          original_title?: string | null;
          release_date?: string | null;
          poster_path?: string | null;
          original_language?: string | null;
          score: number;
          payload?: Json;
          accepted?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["movie_match_candidates"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Movie = Database["public"]["Tables"]["movies"]["Row"];
export type WatchEntry = Database["public"]["Tables"]["watch_entries"]["Row"];
export type MatchCandidate = Database["public"]["Tables"]["movie_match_candidates"]["Row"];
