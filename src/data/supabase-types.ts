// Genererade TypeScript-typer för Supabase-schemat (T14, #14).
//
// GENERERAD via Supabase (generate_typescript_types mot projekt
// kmzhyblzxangpxydufve). Redigera inte för hand: regenerera om schemat ändras
// (Supabase MCP `generate_typescript_types` eller `supabase gen types`).
//
// Driver den typade klienten (supabase-browser.ts) så rooms-API:t (rooms-api.ts)
// får kompilerings-fel om en kolumn/RPC-form driver isär från det faktiska
// schemat (samma "härled från källans fältnamn"-princip som fixtures, lärdomen
// mock-foljer-konsumenttyp-doljer-mappnings-drift).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      // T15 (#15): referenstabell för avsparkstider (deadline-låsets klocka).
      match_kickoffs: {
        Row: {
          kickoff: string;
          match_id: string;
        };
        Insert: {
          kickoff: string;
          match_id: string;
        };
        Update: {
          kickoff?: string;
          match_id?: string;
        };
        Relationships: [];
      };
      // T15 (#15): tips (gissat resultat per rum/match/användare).
      predictions: {
        Row: {
          away_goals: number;
          created_at: string;
          home_goals: number;
          match_id: string;
          room_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          away_goals: number;
          created_at?: string;
          home_goals: number;
          match_id: string;
          room_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          away_goals?: number;
          created_at?: string;
          home_goals?: number;
          match_id?: string;
          room_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'predictions_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      room_match_results: {
        Row: {
          away_goals: number;
          home_goals: number;
          match_id: string;
          penalties_away: number | null;
          penalties_home: number | null;
          room_id: string;
          status: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          away_goals: number;
          home_goals: number;
          match_id: string;
          penalties_away?: number | null;
          penalties_home?: number | null;
          room_id: string;
          status: string;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          away_goals?: number;
          home_goals?: number;
          match_id?: string;
          penalties_away?: number | null;
          penalties_home?: number | null;
          room_id?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'room_match_results_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      room_members: {
        Row: {
          display_name: string;
          joined_at: string;
          room_id: string;
          user_id: string;
        };
        Insert: {
          display_name: string;
          joined_at?: string;
          room_id: string;
          user_id: string;
        };
        Update: {
          display_name?: string;
          joined_at?: string;
          room_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'room_members_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      rooms: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_room: {
        Args: { p_code: string; p_display_name: string; p_name: string };
        Returns: {
          room_code: string;
          room_id: string;
          room_name: string;
        }[];
      };
      is_room_member: { Args: { p_room_id: string }; Returns: boolean };
      join_room_by_code: {
        Args: { p_code: string; p_display_name: string };
        Returns: {
          room_code: string;
          room_id: string;
          room_name: string;
        }[];
      };
      // T15 (#15): slå upp en matchs avsparkstid (deadline-låsets klocka).
      match_kickoff: { Args: { p_match_id: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
