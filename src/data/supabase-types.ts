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
      // T42 (#72): admin-allowlist (vilka user_id som är app-admin = får skriva facit).
      app_admins: {
        Row: {
          added_at: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      // T16 (#16): bracket-/slutspels-tips (vem går vidare per slot + VM-vinnaren).
      bracket_predictions: {
        Row: {
          advancing_team_id: string;
          created_at: string;
          room_id: string;
          slot_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          advancing_team_id: string;
          created_at?: string;
          room_id: string;
          slot_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          advancing_team_id?: string;
          created_at?: string;
          room_id?: string;
          slot_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bracket_predictions_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      // T16 (#16): gruppvinnar-tips (gissad 1:a + 2:a per grupp/rum/användare).
      group_predictions: {
        Row: {
          created_at: string;
          group_id: string;
          room_id: string;
          runner_up_team_id: string;
          updated_at: string;
          user_id: string;
          winner_team_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          room_id: string;
          runner_up_team_id: string;
          updated_at?: string;
          user_id: string;
          winner_team_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          room_id?: string;
          runner_up_team_id?: string;
          updated_at?: string;
          user_id?: string;
          winner_team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_predictions_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
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
      // T42 (#72): GLOBALA officiella matchresultat (facit). INGEN room_id, gäller
      // alla rum/användare. Skriv bara admin (RLS is_app_admin), SELECT öppen.
      official_match_results: {
        Row: {
          away_goals: number;
          home_goals: number;
          match_id: string;
          penalties_away: number | null;
          penalties_home: number | null;
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
          status?: string;
          updated_at?: string;
          updated_by?: string;
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
      // T16 (#16): deadline-ankare för ett bracket-tips. Per-slot (M73..M104) =
      // slottens egen avspark; 'champion' = turneringsstart (g-A-1). Bygger på
      // match_kickoff, så samma NULL-fail-safe gäller (okänd slot => NULL =>
      // skriv nekas, andras tips dolda). Returns string | null, INTE string, av
      // exakt samma säkerhets-skäl som match_kickoff nedan.
      bracket_deadline_kickoff: { Args: { p_slot_id: string }; Returns: string | null };
      create_room: {
        Args: { p_code: string; p_display_name: string; p_name: string };
        Returns: {
          room_code: string;
          room_id: string;
          room_name: string;
        }[];
      };
      // T16 (#16): deadline-ankare för ett grupp-tips = gruppens första match
      // (g-X-1). Returns string | null (okänd grupp => NULL => skriv nekas, andras
      // tips dolda), samma fail-safe-kontrakt som match_kickoff.
      group_deadline_kickoff: { Args: { p_group_id: string }; Returns: string | null };
      // T42 (#72): "är den anropande användaren app-admin?" (RLS-helper för facit-skrivskydd).
      is_app_admin: { Args: never; Returns: boolean };
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
      // Returns string | null: RPC:n är ett rent `select k.kickoff ... where match_id = ...`
      // (migration 20260611120200_t15_predictions_rls.sql) och ger NULL för en okänd match.
      // Det NULL:et är inte ett misstag utan en SÄKERHETS-fail-safe som RLS förlitar sig på
      // (now() < NULL => skriv nekas, now() >= NULL => andras tips dolda), så typen får inte
      // ljuga om non-null, framtida konsumenter måste hantera NULL-fallet.
      match_kickoff: { Args: { p_match_id: string }; Returns: string | null };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
