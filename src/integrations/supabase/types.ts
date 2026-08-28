export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      billing_customers: {
        Row: {
          created_at: string
          stripe_customer_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          stripe_customer_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          stripe_customer_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gear: {
        Row: {
          brand: string | null
          crash_count: number
          created_at: string
          gear_type: Database["public"]["Enums"]["gear_type"]
          id: string
          minutes_since_service: number
          model: string | null
          name: string
          notes: string | null
          pack_count: number
          retired: boolean
          service_interval_minutes: number
          total_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          crash_count?: number
          created_at?: string
          gear_type?: Database["public"]["Enums"]["gear_type"]
          id?: string
          minutes_since_service?: number
          model?: string | null
          name: string
          notes?: string | null
          pack_count?: number
          retired?: boolean
          service_interval_minutes?: number
          total_minutes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          crash_count?: number
          created_at?: string
          gear_type?: Database["public"]["Enums"]["gear_type"]
          id?: string
          minutes_since_service?: number
          model?: string | null
          name?: string
          notes?: string | null
          pack_count?: number
          retired?: boolean
          service_interval_minutes?: number
          total_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gear_parts: {
        Row: {
          category: string | null
          created_at: string
          gear_id: string
          id: string
          installed_on: string
          lifespan_minutes: number
          minutes_used: number
          name: string
          notes: string | null
          spare_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          gear_id: string
          id?: string
          installed_on?: string
          lifespan_minutes?: number
          minutes_used?: number
          name: string
          notes?: string | null
          spare_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          gear_id?: string
          id?: string
          installed_on?: string
          lifespan_minutes?: number
          minutes_used?: number
          name?: string
          notes?: string | null
          spare_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gear_parts_gear_id_fkey"
            columns: ["gear_id"]
            isOneToOne: false
            referencedRelation: "gear"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      maintenance_logs: {
        Row: {
          cost: number | null
          created_at: string
          description: string
          gear_id: string
          id: string
          performed_on: string
          reset_service_clock: boolean
          user_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          description: string
          gear_id: string
          id?: string
          performed_on?: string
          reset_service_clock?: boolean
          user_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          description?: string
          gear_id?: string
          id?: string
          performed_on?: string
          reset_service_clock?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_gear_id_fkey"
            columns: ["gear_id"]
            isOneToOne: false
            referencedRelation: "gear"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_records: {
        Row: {
          achieved_on: string
          created_at: string
          id: string
          label: string
          lap_seconds: number | null
          notes: string | null
          score: number | null
          track_id: string | null
          user_id: string
        }
        Insert: {
          achieved_on?: string
          created_at?: string
          id?: string
          label: string
          lap_seconds?: number | null
          notes?: string | null
          score?: number | null
          track_id?: string | null
          user_id: string
        }
        Update: {
          achieved_on?: string
          created_at?: string
          id?: string
          label?: string
          lap_seconds?: number | null
          notes?: string | null
          score?: number | null
          track_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_records_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accent_color: string
          avatar_url: string | null
          bio: string | null
          callsign: string | null
          created_at: string
          display_name: string | null
          id: string
          is_private: boolean
          subscription_tier: string
          updated_at: string
          weekly_goal_hours: number
        }
        Insert: {
          accent_color?: string
          avatar_url?: string | null
          bio?: string | null
          callsign?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_private?: boolean
          subscription_tier?: string
          updated_at?: string
          weekly_goal_hours?: number
        }
        Update: {
          accent_color?: string
          avatar_url?: string | null
          bio?: string | null
          callsign?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_private?: boolean
          subscription_tier?: string
          updated_at?: string
          weekly_goal_hours?: number
        }
        Relationships: []
      }
      sessions: {
        Row: {
          battery_notes: string | null
          crashes: number
          created_at: string
          duration_minutes: number
          flown_on: string
          gear_id: string | null
          id: string
          location_id: string | null
          notes: string | null
          packs_flown: number
          rating: number | null
          session_type: Database["public"]["Enums"]["session_type"]
          sim_platform: string | null
          start_time: string | null
          track_id: string | null
          updated_at: string
          user_id: string
          weather: Json | null
        }
        Insert: {
          battery_notes?: string | null
          crashes?: number
          created_at?: string
          duration_minutes: number
          flown_on?: string
          gear_id?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          packs_flown?: number
          rating?: number | null
          session_type?: Database["public"]["Enums"]["session_type"]
          sim_platform?: string | null
          start_time?: string | null
          track_id?: string | null
          updated_at?: string
          user_id: string
          weather?: Json | null
        }
        Update: {
          battery_notes?: string | null
          crashes?: number
          created_at?: string
          duration_minutes?: number
          flown_on?: string
          gear_id?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          packs_flown?: number
          rating?: number | null
          session_type?: Database["public"]["Enums"]["session_type"]
          sim_platform?: string | null
          start_time?: string | null
          track_id?: string | null
          updated_at?: string
          user_id?: string
          weather?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_gear_id_fkey"
            columns: ["gear_id"]
            isOneToOne: false
            referencedRelation: "gear"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          team_id: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          team_id: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invite_codes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          team_id: string
          team_role: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          team_id: string
          team_role?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          team_id?: string
          team_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      tracks: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["track_kind"]
          layout_notes: string | null
          location_id: string | null
          name: string
          sim_platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["track_kind"]
          layout_notes?: string | null
          location_id?: string | null
          name: string
          sim_platform?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["track_kind"]
          layout_notes?: string | null
          location_id?: string | null
          name?: string
          sim_platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      join_team_with_code: { Args: { _code: string }; Returns: string }
    }
    Enums: {
      app_role: "free_user" | "pro_user" | "team_admin"
      gear_type: "quad" | "transmitter" | "goggles" | "battery" | "other"
      session_type: "sim" | "real"
      track_kind: "sim" | "real"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["free_user", "pro_user", "team_admin"],
      gear_type: ["quad", "transmitter", "goggles", "battery", "other"],
      session_type: ["sim", "real"],
      track_kind: ["sim", "real"],
    },
  },
} as const
