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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      curiosities: {
        Row: {
          family_id: string | null
          id: string
          message: string
          tree_id: string
          type: Database["public"]["Enums"]["curiosity_type"]
          user_id: string
        }
        Insert: {
          family_id?: string | null
          id?: string
          message: string
          tree_id: string
          type: Database["public"]["Enums"]["curiosity_type"]
          user_id: string
        }
        Update: {
          family_id?: string | null
          id?: string
          message?: string
          tree_id?: string
          type?: Database["public"]["Enums"]["curiosity_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curiosities_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curiosities_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      curiosity_individuals: {
        Row: {
          curiosity_id: string
          individual_id: string
          user_id: string
        }
        Insert: {
          curiosity_id: string
          individual_id: string
          user_id: string
        }
        Update: {
          curiosity_id?: string
          individual_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curiosity_individuals_curiosity_id_fkey"
            columns: ["curiosity_id"]
            isOneToOne: false
            referencedRelation: "curiosities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curiosity_individuals_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_cache: {
        Row: {
          content: string
          created_at: string
          enrichment_type: Database["public"]["Enums"]["enrichment_type"]
          id: string
          individual_id: string
          input_tokens: number | null
          model: string
          output_tokens: number | null
          tree_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          enrichment_type: Database["public"]["Enums"]["enrichment_type"]
          id?: string
          individual_id: string
          input_tokens?: number | null
          model: string
          output_tokens?: number | null
          tree_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          enrichment_type?: Database["public"]["Enums"]["enrichment_type"]
          id?: string
          individual_id?: string
          input_tokens?: number | null
          model?: string
          output_tokens?: number | null
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_cache_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_cache_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          gedcom_xref: string
          husband_id: string | null
          id: string
          marriage_date_confidence:
            | Database["public"]["Enums"]["date_confidence"]
            | null
          marriage_date_day: number | null
          marriage_date_month: number | null
          marriage_date_qualifier:
            | Database["public"]["Enums"]["date_qualifier"]
            | null
          marriage_date_range_end_year: number | null
          marriage_date_range_start_year: number | null
          marriage_date_raw: string | null
          marriage_date_year: number | null
          marriage_place_id: string | null
          tree_id: string
          user_id: string
          wife_id: string | null
        }
        Insert: {
          gedcom_xref: string
          husband_id?: string | null
          id?: string
          marriage_date_confidence?:
            | Database["public"]["Enums"]["date_confidence"]
            | null
          marriage_date_day?: number | null
          marriage_date_month?: number | null
          marriage_date_qualifier?:
            | Database["public"]["Enums"]["date_qualifier"]
            | null
          marriage_date_range_end_year?: number | null
          marriage_date_range_start_year?: number | null
          marriage_date_raw?: string | null
          marriage_date_year?: number | null
          marriage_place_id?: string | null
          tree_id: string
          user_id: string
          wife_id?: string | null
        }
        Update: {
          gedcom_xref?: string
          husband_id?: string | null
          id?: string
          marriage_date_confidence?:
            | Database["public"]["Enums"]["date_confidence"]
            | null
          marriage_date_day?: number | null
          marriage_date_month?: number | null
          marriage_date_qualifier?:
            | Database["public"]["Enums"]["date_qualifier"]
            | null
          marriage_date_range_end_year?: number | null
          marriage_date_range_start_year?: number | null
          marriage_date_raw?: string | null
          marriage_date_year?: number | null
          marriage_place_id?: string | null
          tree_id?: string
          user_id?: string
          wife_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "families_husband_id_fkey"
            columns: ["husband_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "families_marriage_place_id_fkey"
            columns: ["marriage_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "families_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "families_wife_id_fkey"
            columns: ["wife_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
        ]
      }
      family_children: {
        Row: {
          birth_order: number | null
          family_id: string
          individual_id: string
          user_id: string
        }
        Insert: {
          birth_order?: number | null
          family_id: string
          individual_id: string
          user_id: string
        }
        Update: {
          birth_order?: number | null
          family_id?: string
          individual_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_children_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_children_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
        ]
      }
      individual_events: {
        Row: {
          date_confidence: Database["public"]["Enums"]["date_confidence"] | null
          date_day: number | null
          date_month: number | null
          date_qualifier: Database["public"]["Enums"]["date_qualifier"] | null
          date_range_end_year: number | null
          date_range_start_year: number | null
          date_raw: string | null
          date_year: number | null
          event_type: Database["public"]["Enums"]["individual_event_type"]
          id: string
          individual_id: string
          place_id: string | null
          sort_order: number
          tree_id: string
          user_id: string
        }
        Insert: {
          date_confidence?:
            | Database["public"]["Enums"]["date_confidence"]
            | null
          date_day?: number | null
          date_month?: number | null
          date_qualifier?: Database["public"]["Enums"]["date_qualifier"] | null
          date_range_end_year?: number | null
          date_range_start_year?: number | null
          date_raw?: string | null
          date_year?: number | null
          event_type: Database["public"]["Enums"]["individual_event_type"]
          id?: string
          individual_id: string
          place_id?: string | null
          sort_order?: number
          tree_id: string
          user_id: string
        }
        Update: {
          date_confidence?:
            | Database["public"]["Enums"]["date_confidence"]
            | null
          date_day?: number | null
          date_month?: number | null
          date_qualifier?: Database["public"]["Enums"]["date_qualifier"] | null
          date_range_end_year?: number | null
          date_range_start_year?: number | null
          date_raw?: string | null
          date_year?: number | null
          event_type?: Database["public"]["Enums"]["individual_event_type"]
          id?: string
          individual_id?: string
          place_id?: string | null
          sort_order?: number
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "individual_events_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_events_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_events_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      individuals: {
        Row: {
          birth_year: number | null
          death_year: number | null
          full_name: string
          gedcom_xref: string
          given_name: string | null
          has_death_record: boolean
          id: string
          living: boolean
          prefix: string | null
          sex: Database["public"]["Enums"]["sex_type"]
          suffix: string | null
          surname: string | null
          tree_id: string
          user_id: string
        }
        Insert: {
          birth_year?: number | null
          death_year?: number | null
          full_name: string
          gedcom_xref: string
          given_name?: string | null
          has_death_record?: boolean
          id?: string
          living?: boolean
          prefix?: string | null
          sex?: Database["public"]["Enums"]["sex_type"]
          suffix?: string | null
          surname?: string | null
          tree_id: string
          user_id: string
        }
        Update: {
          birth_year?: number | null
          death_year?: number | null
          full_name?: string
          gedcom_xref?: string
          given_name?: string | null
          has_death_record?: boolean
          id?: string
          living?: boolean
          prefix?: string | null
          sex?: Database["public"]["Enums"]["sex_type"]
          suffix?: string | null
          surname?: string | null
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "individuals_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          geocoded_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          parts: string[]
          raw: string
          tree_id: string
          user_id: string
        }
        Insert: {
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          parts?: string[]
          raw: string
          tree_id: string
          user_id: string
        }
        Update: {
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          parts?: string[]
          raw?: string
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: {
          computed_at: string
          generation_distance: number
          home_person_id: string
          id: string
          individual_id: string
          is_collateral: boolean
          is_direct_ancestor: boolean
          is_direct_descendant: boolean
          label: string
          line: string
          path: Json
          tree_id: string
          user_id: string
        }
        Insert: {
          computed_at?: string
          generation_distance: number
          home_person_id: string
          id?: string
          individual_id: string
          is_collateral?: boolean
          is_direct_ancestor?: boolean
          is_direct_descendant?: boolean
          label: string
          line: string
          path: Json
          tree_id: string
          user_id: string
        }
        Update: {
          computed_at?: string
          generation_distance?: number
          home_person_id?: string
          id?: string
          individual_id?: string
          is_collateral?: boolean
          is_direct_ancestor?: boolean
          is_direct_descendant?: boolean
          label?: string
          line?: string
          path?: Json
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_home_person_id_fkey"
            columns: ["home_person_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      research_briefs: {
        Row: {
          content: string
          created_at: string
          id: string
          individual_id: string
          model: string
          status: Database["public"]["Enums"]["research_brief_status"]
          title: string
          tree_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          individual_id: string
          model: string
          status?: Database["public"]["Enums"]["research_brief_status"]
          title: string
          tree_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          individual_id?: string
          model?: string
          status?: Database["public"]["Enums"]["research_brief_status"]
          title?: string
          tree_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_briefs_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_briefs_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      trees: {
        Row: {
          charset: string | null
          export_date: string | null
          family_count: number
          gedcom_version: string | null
          home_person_id: string | null
          id: string
          imported_at: string
          individual_count: number
          name: string
          parse_warnings: Json
          place_count: number
          source_file: string | null
          user_id: string
        }
        Insert: {
          charset?: string | null
          export_date?: string | null
          family_count?: number
          gedcom_version?: string | null
          home_person_id?: string | null
          id?: string
          imported_at?: string
          individual_count?: number
          name: string
          parse_warnings?: Json
          place_count?: number
          source_file?: string | null
          user_id: string
        }
        Update: {
          charset?: string | null
          export_date?: string | null
          family_count?: number
          gedcom_version?: string | null
          home_person_id?: string | null
          id?: string
          imported_at?: string
          individual_count?: number
          name?: string
          parse_warnings?: Json
          place_count?: number
          source_file?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trees_home_person_id_fkey"
            columns: ["home_person_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      curiosity_type:
        | "child_born_before_parent"
        | "death_before_birth"
        | "implausible_lifespan"
        | "marriage_before_birth"
        | "parent_too_young"
        | "parent_too_old"
        | "large_sibling_date_gap"
      date_confidence: "exact" | "approximate" | "estimated" | "unknown"
      date_qualifier:
        | "exact"
        | "about"
        | "calculated"
        | "estimated"
        | "before"
        | "after"
        | "between"
        | "unknown"
      enrichment_type: "biography" | "historical_context"
      individual_event_type: "birth" | "death" | "burial" | "residence"
      research_brief_status: "open" | "in_progress" | "resolved" | "archived"
      sex_type: "M" | "F" | "U"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      curiosity_type: [
        "child_born_before_parent",
        "death_before_birth",
        "implausible_lifespan",
        "marriage_before_birth",
        "parent_too_young",
        "parent_too_old",
        "large_sibling_date_gap",
      ],
      date_confidence: ["exact", "approximate", "estimated", "unknown"],
      date_qualifier: [
        "exact",
        "about",
        "calculated",
        "estimated",
        "before",
        "after",
        "between",
        "unknown",
      ],
      enrichment_type: ["biography", "historical_context"],
      individual_event_type: ["birth", "death", "burial", "residence"],
      research_brief_status: ["open", "in_progress", "resolved", "archived"],
      sex_type: ["M", "F", "U"],
    },
  },
} as const
