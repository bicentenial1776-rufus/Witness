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
      citations: {
        Row: {
          ancestry_apid: string | null
          fact: string
          family_id: string | null
          id: string
          individual_id: string | null
          page: string | null
          source_id: string
          text_excerpt: string | null
          tree_id: string
          url: string | null
          user_id: string
        }
        Insert: {
          ancestry_apid?: string | null
          fact: string
          family_id?: string | null
          id?: string
          individual_id?: string | null
          page?: string | null
          source_id: string
          text_excerpt?: string | null
          tree_id: string
          url?: string | null
          user_id: string
        }
        Update: {
          ancestry_apid?: string | null
          fact?: string
          family_id?: string | null
          id?: string
          individual_id?: string | null
          page?: string | null
          source_id?: string
          text_excerpt?: string | null
          tree_id?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "citations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
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
          father_relation: string | null
          individual_id: string
          mother_relation: string | null
          user_id: string
        }
        Insert: {
          birth_order?: number | null
          family_id: string
          father_relation?: string | null
          individual_id: string
          mother_relation?: string | null
          user_id: string
        }
        Update: {
          birth_order?: number | null
          family_id?: string
          father_relation?: string | null
          individual_id?: string
          mother_relation?: string | null
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
      findings: {
        Row: {
          edition_key: string | null
          finding_id: string
          first_seen_at: string
          section: string | null
          sentence: string
          source: string
          subject_ids: string[]
          tree_id: string
          user_id: string
        }
        Insert: {
          edition_key?: string | null
          finding_id: string
          first_seen_at?: string
          section?: string | null
          sentence: string
          source: string
          subject_ids?: string[]
          tree_id: string
          user_id: string
        }
        Update: {
          edition_key?: string | null
          finding_id?: string
          first_seen_at?: string
          section?: string | null
          sentence?: string
          source?: string
          subject_ids?: string[]
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_ticks: {
        Row: {
          created_at: string
          minute: string
        }
        Insert: {
          created_at?: string
          minute: string
        }
        Update: {
          created_at?: string
          minute?: string
        }
        Relationships: []
      }
      historical_events: {
        Row: {
          created_at: string
          end_year: number
          geo_scope: Json | null
          id: string
          keywords: string[] | null
          lens_affinity: string[] | null
          name: string
          region: string
          sort_order: number
          start_year: number
          summary: string
          tier: string
        }
        Insert: {
          created_at?: string
          end_year: number
          geo_scope?: Json | null
          id: string
          keywords?: string[] | null
          lens_affinity?: string[] | null
          name: string
          region: string
          sort_order: number
          start_year: number
          summary: string
          tier?: string
        }
        Update: {
          created_at?: string
          end_year?: number
          geo_scope?: Json | null
          id?: string
          keywords?: string[] | null
          lens_affinity?: string[] | null
          name?: string
          region?: string
          sort_order?: number
          start_year?: number
          summary?: string
          tier?: string
        }
        Relationships: []
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
          detail: string | null
          event_type: Database["public"]["Enums"]["individual_event_type"]
          id: string
          individual_id: string
          label: string | null
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
          detail?: string | null
          event_type: Database["public"]["Enums"]["individual_event_type"]
          id?: string
          individual_id: string
          label?: string | null
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
          detail?: string | null
          event_type?: Database["public"]["Enums"]["individual_event_type"]
          id?: string
          individual_id?: string
          label?: string | null
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
          ancestry_apid: string | null
          ancestry_uid: string | null
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
          ancestry_apid?: string | null
          ancestry_uid?: string | null
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
          ancestry_apid?: string | null
          ancestry_uid?: string | null
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
      library_pins: {
        Row: {
          created_at: string
          query_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          query_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          query_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_pins_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "query_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      nara_api_calls: {
        Row: {
          calls: number
          month: string
        }
        Insert: {
          calls?: number
          month: string
        }
        Update: {
          calls?: number
          month?: string
        }
        Relationships: []
      }
      nara_candidates: {
        Row: {
          created_at: string
          id: string
          individual_id: string
          match_reason: string | null
          na_id: number
          place_id: string | null
          resolved_at: string | null
          score: number | null
          series: string
          status: Database["public"]["Enums"]["nara_candidate_status"]
          tree_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          individual_id: string
          match_reason?: string | null
          na_id: number
          place_id?: string | null
          resolved_at?: string | null
          score?: number | null
          series: string
          status?: Database["public"]["Enums"]["nara_candidate_status"]
          tree_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          individual_id?: string
          match_reason?: string | null
          na_id?: number
          place_id?: string | null
          resolved_at?: string | null
          score?: number | null
          series?: string
          status?: Database["public"]["Enums"]["nara_candidate_status"]
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nara_candidates_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nara_candidates_na_id_fkey"
            columns: ["na_id"]
            isOneToOne: false
            referencedRelation: "nara_documents"
            referencedColumns: ["na_id"]
          },
          {
            foreignKeyName: "nara_candidates_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nara_candidates_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      nara_documents: {
        Row: {
          end_year: number | null
          fetched_at: string
          level_of_description: string | null
          na_id: number
          object_count: number
          object_url: string | null
          record_group: string | null
          start_year: number | null
          title: string
          use_restriction: string | null
        }
        Insert: {
          end_year?: number | null
          fetched_at?: string
          level_of_description?: string | null
          na_id: number
          object_count?: number
          object_url?: string | null
          record_group?: string | null
          start_year?: number | null
          title: string
          use_restriction?: string | null
        }
        Update: {
          end_year?: number | null
          fetched_at?: string
          level_of_description?: string | null
          na_id?: number
          object_count?: number
          object_url?: string | null
          record_group?: string | null
          start_year?: number | null
          title?: string
          use_restriction?: string | null
        }
        Relationships: []
      }
      nara_enrichment_state: {
        Row: {
          calls_used: number
          candidates_found: number
          enriched_at: string
          individual_id: string
          tree_id: string
          user_id: string
        }
        Insert: {
          calls_used?: number
          candidates_found?: number
          enriched_at?: string
          individual_id: string
          tree_id: string
          user_id: string
        }
        Update: {
          calls_used?: number
          candidates_found?: number
          enriched_at?: string
          individual_id?: string
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nara_enrichment_state_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: true
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nara_enrichment_state_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      nara_ticks: {
        Row: {
          bucket: string
          created_at: string
        }
        Insert: {
          bucket: string
          created_at?: string
        }
        Update: {
          bucket?: string
          created_at?: string
        }
        Relationships: []
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
      profiles: {
        Row: {
          created_at: string
          digest_email_enabled: boolean
          digest_email_last_sent_at: string | null
          id: string
          onboarding_completed_at: string | null
        }
        Insert: {
          created_at?: string
          digest_email_enabled?: boolean
          digest_email_last_sent_at?: string | null
          id: string
          onboarding_completed_at?: string | null
        }
        Update: {
          created_at?: string
          digest_email_enabled?: boolean
          digest_email_last_sent_at?: string | null
          id?: string
          onboarding_completed_at?: string | null
        }
        Relationships: []
      }
      query_catalog: {
        Row: {
          category: string
          created_at: string
          detail: string | null
          id: string
          keywords: string[]
          kind: string
          params: Json
          sort_order: number
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          detail?: string | null
          id: string
          keywords?: string[]
          kind: string
          params?: Json
          sort_order?: number
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          detail?: string | null
          id?: string
          keywords?: string[]
          kind?: string
          params?: Json
          sort_order?: number
          title?: string
        }
        Relationships: []
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
      share_links: {
        Row: {
          created_at: string
          expires_at: string
          individual_id: string
          kind: string
          payload: Json
          revoked_at: string | null
          sharer_name: string | null
          token: string
          tree_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          individual_id: string
          kind?: string
          payload: Json
          revoked_at?: string | null
          sharer_name?: string | null
          token: string
          tree_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          individual_id?: string
          kind?: string
          payload?: Json
          revoked_at?: string | null
          sharer_name?: string | null
          token?: string
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_individual_id_fkey"
            columns: ["individual_id"]
            isOneToOne: false
            referencedRelation: "individuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          ancestry_apid: string | null
          author: string | null
          gedcom_xref: string
          id: string
          publisher: string | null
          title: string | null
          tree_id: string
          user_id: string
        }
        Insert: {
          ancestry_apid?: string | null
          author?: string | null
          gedcom_xref: string
          id?: string
          publisher?: string | null
          title?: string | null
          tree_id: string
          user_id: string
        }
        Update: {
          ancestry_apid?: string | null
          author?: string | null
          gedcom_xref?: string
          id?: string
          publisher?: string | null
          title?: string | null
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_health_marks: {
        Row: {
          created_at: string
          finding_key: string
          id: string
          tree_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          finding_key: string
          id?: string
          tree_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          finding_key?: string
          id?: string
          tree_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tree_health_marks_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_health_rulings: {
        Row: {
          created_at: string
          id: string
          user_id: string
          xref_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          xref_key: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          xref_key?: string
        }
        Relationships: []
      }
      trees: {
        Row: {
          ancestry_tree_id: string | null
          charset: string | null
          export_date: string | null
          family_count: number
          gedcom_bytes: number | null
          gedcom_path: string | null
          gedcom_uploaded_at: string | null
          gedcom_version: string | null
          home_person_id: string | null
          id: string
          imported_at: string
          individual_count: number
          last_pulse: Json | null
          last_pulse_at: string | null
          name: string
          parse_warnings: Json
          place_count: number
          refreshed_from: string | null
          source_file: string | null
          user_id: string
        }
        Insert: {
          ancestry_tree_id?: string | null
          charset?: string | null
          export_date?: string | null
          family_count?: number
          gedcom_bytes?: number | null
          gedcom_path?: string | null
          gedcom_uploaded_at?: string | null
          gedcom_version?: string | null
          home_person_id?: string | null
          id?: string
          imported_at?: string
          individual_count?: number
          last_pulse?: Json | null
          last_pulse_at?: string | null
          name: string
          parse_warnings?: Json
          place_count?: number
          refreshed_from?: string | null
          source_file?: string | null
          user_id: string
        }
        Update: {
          ancestry_tree_id?: string | null
          charset?: string | null
          export_date?: string | null
          family_count?: number
          gedcom_bytes?: number | null
          gedcom_path?: string | null
          gedcom_uploaded_at?: string | null
          gedcom_version?: string | null
          home_person_id?: string | null
          id?: string
          imported_at?: string
          individual_count?: number
          last_pulse?: Json | null
          last_pulse_at?: string | null
          name?: string
          parse_warnings?: Json
          place_count?: number
          refreshed_from?: string | null
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
      bump_nara_calls: {
        Args: { p_calls: number; p_month: string }
        Returns: number
      }
      delete_tree_batch: { Args: { p_tree_id: string }; Returns: Json }
      get_share: { Args: { p_token: string }; Returns: Json }
      recount_tree: { Args: { p_tree_id: string }; Returns: Json }
      reuse_geocodes: { Args: { p_tree_id: string }; Returns: number }
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
      enrichment_type: "biography" | "historical_context" | "digest_note"
      individual_event_type:
        | "birth"
        | "death"
        | "burial"
        | "residence"
        | "military"
        | "occupation"
        | "custom"
        | "probate"
      nara_candidate_status: "pending" | "confirmed" | "dismissed"
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
      enrichment_type: ["biography", "historical_context", "digest_note"],
      individual_event_type: [
        "birth",
        "death",
        "burial",
        "residence",
        "military",
        "occupation",
        "custom",
        "probate",
      ],
      nara_candidate_status: ["pending", "confirmed", "dismissed"],
      research_brief_status: ["open", "in_progress", "resolved", "archived"],
      sex_type: ["M", "F", "U"],
    },
  },
} as const
