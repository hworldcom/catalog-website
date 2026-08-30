export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          parent_id: string | null;
          product_code_prefix: string | null;
          slug: string;
          sort_order: number;
          tagline: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          parent_id?: string | null;
          product_code_prefix?: string | null;
          slug: string;
          sort_order?: number;
          tagline?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
          product_code_prefix?: string | null;
          slug?: string;
          sort_order?: number;
          tagline?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      classifier_import_group_outcomes: {
        Row: {
          approved_category_slug: string | null;
          classifier_group_id: string;
          classifier_import_run_id: string;
          created_at: string;
          error_code: string | null;
          product_draft_id: string | null;
          retryable: boolean;
          source_cover_classifier_image_id: string;
          source_group_position: number | null;
          status: Database["public"]["Enums"]["classifier_import_group_status"];
          updated_at: string;
        };
        Insert: {
          approved_category_slug?: string | null;
          classifier_group_id: string;
          classifier_import_run_id: string;
          created_at?: string;
          error_code?: string | null;
          product_draft_id?: string | null;
          retryable?: boolean;
          source_cover_classifier_image_id: string;
          source_group_position?: number | null;
          status?: Database["public"]["Enums"]["classifier_import_group_status"];
          updated_at?: string;
        };
        Update: {
          approved_category_slug?: string | null;
          classifier_group_id?: string;
          classifier_import_run_id?: string;
          created_at?: string;
          error_code?: string | null;
          product_draft_id?: string | null;
          retryable?: boolean;
          source_cover_classifier_image_id?: string;
          source_group_position?: number | null;
          status?: Database["public"]["Enums"]["classifier_import_group_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classifier_import_group_outcomes_classifier_import_run_id_fkey";
            columns: ["classifier_import_run_id"];
            isOneToOne: false;
            referencedRelation: "classifier_import_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classifier_import_group_outcomes_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      classifier_import_runs: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          classifier_batch_id: string;
          classifier_organization_id: string;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          id: string;
          last_heartbeat_at: string | null;
          operation_kind: Database["public"]["Enums"]["classifier_import_operation_kind"];
          pipeline_version: string | null;
          requested_by_user_id: string | null;
          retry_policy: Database["public"]["Enums"]["classifier_import_retry_policy"];
          retryable: boolean;
          seller_classifier_workflow_id: string | null;
          seller_id: string;
          status: Database["public"]["Enums"]["classifier_import_status"];
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          classifier_batch_id: string;
          classifier_organization_id: string;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          last_heartbeat_at?: string | null;
          operation_kind?: Database["public"]["Enums"]["classifier_import_operation_kind"];
          pipeline_version?: string | null;
          requested_by_user_id?: string | null;
          retry_policy?: Database["public"]["Enums"]["classifier_import_retry_policy"];
          retryable?: boolean;
          seller_classifier_workflow_id?: string | null;
          seller_id: string;
          status?: Database["public"]["Enums"]["classifier_import_status"];
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          classifier_batch_id?: string;
          classifier_organization_id?: string;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          last_heartbeat_at?: string | null;
          operation_kind?: Database["public"]["Enums"]["classifier_import_operation_kind"];
          pipeline_version?: string | null;
          requested_by_user_id?: string | null;
          retry_policy?: Database["public"]["Enums"]["classifier_import_retry_policy"];
          retryable?: boolean;
          seller_classifier_workflow_id?: string | null;
          seller_id?: string;
          status?: Database["public"]["Enums"]["classifier_import_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classifier_import_runs_seller_classifier_workflow_id_fkey";
            columns: ["seller_classifier_workflow_id"];
            isOneToOne: false;
            referencedRelation: "seller_classifier_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classifier_import_runs_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      delegated_administrator_action_attempts: {
        Row: {
          action_type: string;
          administrator_user_id: string;
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          request_fingerprint: string;
          request_id: string;
          seller_id: string;
          status: string;
          target_id: string | null;
          workflow_id: string;
        };
        Insert: {
          action_type: string;
          administrator_user_id: string;
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          request_fingerprint: string;
          request_id: string;
          seller_id: string;
          status?: string;
          target_id?: string | null;
          workflow_id: string;
        };
        Update: {
          action_type?: string;
          administrator_user_id?: string;
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          request_fingerprint?: string;
          request_id?: string;
          seller_id?: string;
          status?: string;
          target_id?: string | null;
          workflow_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delegated_administrator_action_attempts_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delegated_administrator_action_attempts_workflow_id_fkey";
            columns: ["workflow_id"];
            isOneToOne: false;
            referencedRelation: "seller_classifier_batches";
            referencedColumns: ["id"];
          },
        ];
      };
      direct_product_legacy_cover_allowances: {
        Row: {
          product_draft_id: string;
          recorded_at: string;
          recorded_cover_image_url: string;
        };
        Insert: {
          product_draft_id: string;
          recorded_at?: string;
          recorded_cover_image_url: string;
        };
        Update: {
          product_draft_id?: string;
          recorded_at?: string;
          recorded_cover_image_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "direct_product_legacy_cover_allowances_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          buyer_country: string | null;
          buyer_email: string | null;
          buyer_name: string | null;
          buyer_phone: string | null;
          created_at: string;
          id: string;
          message: string | null;
          product_id: string | null;
          seller_id: string | null;
          source: Database["public"]["Enums"]["lead_source"];
        };
        Insert: {
          buyer_country?: string | null;
          buyer_email?: string | null;
          buyer_name?: string | null;
          buyer_phone?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          product_id?: string | null;
          seller_id?: string | null;
          source?: Database["public"]["Enums"]["lead_source"];
        };
        Update: {
          buyer_country?: string | null;
          buyer_email?: string | null;
          buyer_name?: string | null;
          buyer_phone?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          product_id?: string | null;
          seller_id?: string | null;
          source?: Database["public"]["Enums"]["lead_source"];
        };
        Relationships: [
          {
            foreignKeyName: "leads_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      product_audience_memberships: {
        Row: {
          audience: string;
          created_at: string;
          product_id: string;
        };
        Insert: {
          audience: string;
          created_at?: string;
          product_id: string;
        };
        Update: {
          audience?: string;
          created_at?: string;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_audience_memberships_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_code_allocations: {
        Row: {
          allocated_at: string;
          catalog_category_code_snapshot: string;
          company_code_snapshot: string;
          product_category_code_snapshot: string;
          product_code: string;
          product_id: string;
          seller_id: string;
        };
        Insert: {
          allocated_at?: string;
          catalog_category_code_snapshot: string;
          company_code_snapshot: string;
          product_category_code_snapshot: string;
          product_code: string;
          product_id: string;
          seller_id: string;
        };
        Update: {
          allocated_at?: string;
          catalog_category_code_snapshot?: string;
          company_code_snapshot?: string;
          product_category_code_snapshot?: string;
          product_code?: string;
          product_id?: string;
          seller_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_code_allocations_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_description_generation_attempts: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          claimed_moderation_revision: number | null;
          created_at: string;
          error_code: string | null;
          finished_at: string | null;
          product_draft_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          claimed_moderation_revision?: number | null;
          created_at?: string;
          error_code?: string | null;
          finished_at?: string | null;
          product_draft_id: string;
          status: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          claimed_moderation_revision?: number | null;
          created_at?: string;
          error_code?: string | null;
          finished_at?: string | null;
          product_draft_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_description_generation_atte_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_descriptions: {
        Row: {
          backfilled_from_legacy: boolean;
          created_at: string;
          description_text: string;
          facts_revision: number | null;
          generated_at: string | null;
          language: string;
          model: string | null;
          pipeline_version: string | null;
          product_draft_id: string;
          provider: string | null;
          source: string;
          updated_at: string;
        };
        Insert: {
          backfilled_from_legacy?: boolean;
          created_at?: string;
          description_text: string;
          facts_revision?: number | null;
          generated_at?: string | null;
          language: string;
          model?: string | null;
          pipeline_version?: string | null;
          product_draft_id: string;
          provider?: string | null;
          source: string;
          updated_at?: string;
        };
        Update: {
          backfilled_from_legacy?: boolean;
          created_at?: string;
          description_text?: string;
          facts_revision?: number | null;
          generated_at?: string | null;
          language?: string;
          model?: string | null;
          pipeline_version?: string | null;
          product_draft_id?: string;
          provider?: string | null;
          source?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_descriptions_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_facts: {
        Row: {
          created_at: string;
          facts_json: Json;
          facts_revision: number;
          product_draft_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          facts_json?: Json;
          facts_revision?: number;
          product_draft_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          facts_json?: Json;
          facts_revision?: number;
          product_draft_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_facts_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_image_promotions: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          classifier_batch_id: string;
          classifier_group_id: string;
          classifier_image_id: string;
          classifier_organization_id: string;
          created_at: string;
          destination_size_bytes: number | null;
          error_code: string | null;
          id: string;
          is_source_cover: boolean;
          last_attempt_at: string | null;
          product_draft_id: string;
          product_draft_image_id: string;
          promoted_at: string | null;
          retryable: boolean;
          source_content_length: number | null;
          status: Database["public"]["Enums"]["product_draft_image_promotion_status"];
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          classifier_batch_id: string;
          classifier_group_id: string;
          classifier_image_id: string;
          classifier_organization_id: string;
          created_at?: string;
          destination_size_bytes?: number | null;
          error_code?: string | null;
          id?: string;
          is_source_cover: boolean;
          last_attempt_at?: string | null;
          product_draft_id: string;
          product_draft_image_id: string;
          promoted_at?: string | null;
          retryable?: boolean;
          source_content_length?: number | null;
          status?: Database["public"]["Enums"]["product_draft_image_promotion_status"];
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          classifier_batch_id?: string;
          classifier_group_id?: string;
          classifier_image_id?: string;
          classifier_organization_id?: string;
          created_at?: string;
          destination_size_bytes?: number | null;
          error_code?: string | null;
          id?: string;
          is_source_cover?: boolean;
          last_attempt_at?: string | null;
          product_draft_id?: string;
          product_draft_image_id?: string;
          promoted_at?: string | null;
          retryable?: boolean;
          source_content_length?: number | null;
          status?: Database["public"]["Enums"]["product_draft_image_promotion_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_image_promotions_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_draft_image_promotions_product_draft_image_id_fkey";
            columns: ["product_draft_image_id"];
            isOneToOne: true;
            referencedRelation: "product_draft_images";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_image_storage_cutovers: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          completed_at: string | null;
          completed_count: number;
          created_at: string;
          error_code: string | null;
          failed_count: number;
          last_attempt_at: string | null;
          pending_count: number;
          release_blocking_count: number;
          scan_cursor: string | null;
          scan_phase: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          started_at: string | null;
          started_count: number;
          status: Database["public"]["Enums"]["product_draft_image_storage_cutover_status"];
          updated_at: string;
          version: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          completed_count?: number;
          created_at?: string;
          error_code?: string | null;
          failed_count?: number;
          last_attempt_at?: string | null;
          pending_count?: number;
          release_blocking_count?: number;
          scan_cursor?: string | null;
          scan_phase?: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          started_at?: string | null;
          started_count?: number;
          status?: Database["public"]["Enums"]["product_draft_image_storage_cutover_status"];
          updated_at?: string;
          version: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          completed_count?: number;
          created_at?: string;
          error_code?: string | null;
          failed_count?: number;
          last_attempt_at?: string | null;
          pending_count?: number;
          release_blocking_count?: number;
          scan_cursor?: string | null;
          scan_phase?: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          started_at?: string | null;
          started_count?: number;
          status?: Database["public"]["Enums"]["product_draft_image_storage_cutover_status"];
          updated_at?: string;
          version?: string;
        };
        Relationships: [];
      };
      product_draft_image_storage_reconciliations: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          completed_at: string | null;
          created_at: string;
          destination_key: string;
          error_code: string | null;
          last_attempt_at: string | null;
          product_draft_image_id: string | null;
          public_object_state: Database["public"]["Enums"]["product_draft_image_public_object_state"];
          release_blocking: boolean;
          retryable: boolean;
          status: Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"];
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          destination_key: string;
          error_code?: string | null;
          last_attempt_at?: string | null;
          product_draft_image_id?: string | null;
          public_object_state?: Database["public"]["Enums"]["product_draft_image_public_object_state"];
          release_blocking?: boolean;
          retryable?: boolean;
          status?: Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"];
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          destination_key?: string;
          error_code?: string | null;
          last_attempt_at?: string | null;
          product_draft_image_id?: string | null;
          public_object_state?: Database["public"]["Enums"]["product_draft_image_public_object_state"];
          release_blocking?: boolean;
          retryable?: boolean;
          status?: Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_image_storage_reconci_product_draft_image_id_fkey";
            columns: ["product_draft_image_id"];
            isOneToOne: true;
            referencedRelation: "product_draft_images";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_images: {
        Row: {
          classifier_image_id: string | null;
          client_upload_id: string | null;
          content_type: string | null;
          created_at: string;
          destination_key: string;
          id: string;
          lifecycle_error_code: string | null;
          original_filename: string | null;
          product_draft_id: string;
          size_bytes: number | null;
          source_kind: string;
          source_position: number;
          status: Database["public"]["Enums"]["product_draft_image_status"];
          storage_bucket: string;
          updated_at: string;
        };
        Insert: {
          classifier_image_id?: string | null;
          client_upload_id?: string | null;
          content_type?: string | null;
          created_at?: string;
          destination_key: string;
          id?: string;
          lifecycle_error_code?: string | null;
          original_filename?: string | null;
          product_draft_id: string;
          size_bytes?: number | null;
          source_kind?: string;
          source_position: number;
          status?: Database["public"]["Enums"]["product_draft_image_status"];
          storage_bucket?: string;
          updated_at?: string;
        };
        Update: {
          classifier_image_id?: string | null;
          client_upload_id?: string | null;
          content_type?: string | null;
          created_at?: string;
          destination_key?: string;
          id?: string;
          lifecycle_error_code?: string | null;
          original_filename?: string | null;
          product_draft_id?: string;
          size_bytes?: number | null;
          source_kind?: string;
          source_position?: number;
          status?: Database["public"]["Enums"]["product_draft_image_status"];
          storage_bucket?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_images_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_source_memberships: {
        Row: {
          classifier_batch_id: string;
          classifier_group_id: string;
          classifier_image_id: string;
          classifier_organization_id: string;
          created_at: string;
          duplicate_of_classifier_image_id: string | null;
          is_duplicate: boolean;
          product_draft_id: string;
          promotion_required: boolean;
          source_position: number;
          updated_at: string;
        };
        Insert: {
          classifier_batch_id: string;
          classifier_group_id: string;
          classifier_image_id: string;
          classifier_organization_id: string;
          created_at?: string;
          duplicate_of_classifier_image_id?: string | null;
          is_duplicate: boolean;
          product_draft_id: string;
          promotion_required: boolean;
          source_position: number;
          updated_at?: string;
        };
        Update: {
          classifier_batch_id?: string;
          classifier_group_id?: string;
          classifier_image_id?: string;
          classifier_organization_id?: string;
          created_at?: string;
          duplicate_of_classifier_image_id?: string | null;
          is_duplicate?: boolean;
          product_draft_id?: string;
          promotion_required?: boolean;
          source_position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_source_memberships_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_image_publication_cutover_changes: {
        Row: {
          cover_changed: boolean;
          previous_cover_image_url: string | null;
          previous_status: Database["public"]["Enums"]["product_status"];
          product_draft_id: string;
          recorded_at: string;
          status_changed: boolean;
        };
        Insert: {
          cover_changed: boolean;
          previous_cover_image_url?: string | null;
          previous_status: Database["public"]["Enums"]["product_status"];
          product_draft_id: string;
          recorded_at?: string;
          status_changed: boolean;
        };
        Update: {
          cover_changed?: boolean;
          previous_cover_image_url?: string | null;
          previous_status?: Database["public"]["Enums"]["product_status"];
          product_draft_id?: string;
          recorded_at?: string;
          status_changed?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "product_image_publication_cutover_changes_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_image_publication_items: {
        Row: {
          attempt_token: string | null;
          created_at: string;
          destination_key: string;
          error_code: string | null;
          expected_content_type: string;
          expected_source_size_bytes: number;
          is_cover: boolean;
          object_created_by_attempt_token: string | null;
          product_draft_id: string;
          product_draft_image_id: string;
          public_etag: string | null;
          public_sha256: string | null;
          public_size_bytes: number | null;
          public_url: string | null;
          publication_order: number;
          source_bucket: string;
          source_object_key: string;
          source_position: number;
          source_sha256: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_token?: string | null;
          created_at?: string;
          destination_key: string;
          error_code?: string | null;
          expected_content_type: string;
          expected_source_size_bytes: number;
          is_cover: boolean;
          object_created_by_attempt_token?: string | null;
          product_draft_id: string;
          product_draft_image_id: string;
          public_etag?: string | null;
          public_sha256?: string | null;
          public_size_bytes?: number | null;
          public_url?: string | null;
          publication_order: number;
          source_bucket: string;
          source_object_key: string;
          source_position: number;
          source_sha256?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_token?: string | null;
          created_at?: string;
          destination_key?: string;
          error_code?: string | null;
          expected_content_type?: string;
          expected_source_size_bytes?: number;
          is_cover?: boolean;
          object_created_by_attempt_token?: string | null;
          product_draft_id?: string;
          product_draft_image_id?: string;
          public_etag?: string | null;
          public_sha256?: string | null;
          public_size_bytes?: number | null;
          public_url?: string | null;
          publication_order?: number;
          source_bucket?: string;
          source_object_key?: string;
          source_position?: number;
          source_sha256?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_image_publication_items_run_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "product_image_publication_runs";
            referencedColumns: ["product_draft_id"];
          },
          {
            foreignKeyName: "product_image_publication_items_source_fkey";
            columns: ["product_draft_id", "product_draft_image_id"];
            isOneToOne: true;
            referencedRelation: "product_draft_images";
            referencedColumns: ["product_draft_id", "id"];
          },
        ];
      };
      product_image_publication_runs: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          completed_at: string | null;
          created_at: string;
          delegated_action_request_fingerprint: string | null;
          delegated_action_request_id: string | null;
          error_code: string | null;
          product_draft_id: string;
          seller_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          delegated_action_request_fingerprint?: string | null;
          delegated_action_request_id?: string | null;
          error_code?: string | null;
          product_draft_id: string;
          seller_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          delegated_action_request_fingerprint?: string | null;
          delegated_action_request_id?: string | null;
          error_code?: string | null;
          product_draft_id?: string;
          seller_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_image_publication_runs_delegated_action_fkey";
            columns: ["delegated_action_request_id"];
            isOneToOne: false;
            referencedRelation: "delegated_administrator_action_attempts";
            referencedColumns: ["request_id"];
          },
          {
            foreignKeyName: "product_image_publication_runs_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_image_publication_runs_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      product_images: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          sort_order: number;
          source_product_draft_image_id: string | null;
          url: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          sort_order?: number;
          source_product_draft_image_id?: string | null;
          url: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          sort_order?: number;
          source_product_draft_image_id?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_images_source_product_draft_image_id_fkey";
            columns: ["source_product_draft_image_id"];
            isOneToOne: true;
            referencedRelation: "product_draft_images";
            referencedColumns: ["id"];
          },
        ];
      };
      product_moderation_events: {
        Row: {
          actor_user_id: string;
          created_at: string;
          event_type: string;
          expected_revision: number | null;
          id: string;
          product_id: string;
          reason: string | null;
          request_id: string;
          seller_id: string;
          submission_id: string | null;
        };
        Insert: {
          actor_user_id: string;
          created_at?: string;
          event_type: string;
          expected_revision?: number | null;
          id?: string;
          product_id: string;
          reason?: string | null;
          request_id: string;
          seller_id: string;
          submission_id?: string | null;
        };
        Update: {
          actor_user_id?: string;
          created_at?: string;
          event_type?: string;
          expected_revision?: number | null;
          id?: string;
          product_id?: string;
          reason?: string | null;
          request_id?: string;
          seller_id?: string;
          submission_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_moderation_events_product_fkey";
            columns: ["product_id", "seller_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "seller_id"];
          },
          {
            foreignKeyName: "product_moderation_events_submission_fkey";
            columns: ["submission_id", "product_id", "seller_id"];
            isOneToOne: false;
            referencedRelation: "product_moderation_submissions";
            referencedColumns: ["id", "product_id", "seller_id"];
          },
        ];
      };
      product_moderation_submission_images: {
        Row: {
          created_at: string;
          is_cover: boolean;
          position: number;
          product_draft_image_id: string;
          product_id: string;
          submission_id: string;
        };
        Insert: {
          created_at?: string;
          is_cover?: boolean;
          position: number;
          product_draft_image_id: string;
          product_id: string;
          submission_id: string;
        };
        Update: {
          created_at?: string;
          is_cover?: boolean;
          position?: number;
          product_draft_image_id?: string;
          product_id?: string;
          submission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_moderation_submission_images_source_fkey";
            columns: ["product_id", "product_draft_image_id"];
            isOneToOne: false;
            referencedRelation: "product_draft_images";
            referencedColumns: ["product_draft_id", "id"];
          },
          {
            foreignKeyName: "product_moderation_submission_images_submission_fkey";
            columns: ["submission_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "product_moderation_submissions";
            referencedColumns: ["id", "product_id"];
          },
        ];
      };
      product_moderation_submissions: {
        Row: {
          administrator_user_id: string | null;
          created_at: string;
          decided_at: string | null;
          decision_request_id: string | null;
          id: string;
          product_id: string;
          review_status: string;
          revision: number;
          seller_id: string;
          seller_request_id: string;
          seller_visible_reason: string | null;
          snapshot_json: Json;
          snapshot_schema_version: number;
          submission_kind: string;
          submitted_at: string;
          submitted_by_user_id: string;
          updated_at: string;
        };
        Insert: {
          administrator_user_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decision_request_id?: string | null;
          id?: string;
          product_id: string;
          review_status?: string;
          revision: number;
          seller_id: string;
          seller_request_id: string;
          seller_visible_reason?: string | null;
          snapshot_json: Json;
          snapshot_schema_version?: number;
          submission_kind: string;
          submitted_at?: string;
          submitted_by_user_id: string;
          updated_at?: string;
        };
        Update: {
          administrator_user_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decision_request_id?: string | null;
          id?: string;
          product_id?: string;
          review_status?: string;
          revision?: number;
          seller_id?: string;
          seller_request_id?: string;
          seller_visible_reason?: string | null;
          snapshot_json?: Json;
          snapshot_schema_version?: number;
          submission_kind?: string;
          submitted_at?: string;
          submitted_by_user_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_moderation_submissions_product_fkey";
            columns: ["product_id", "seller_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "seller_id"];
          },
        ];
      };
      product_moderation_working_copies: {
        Row: {
          created_at: string;
          product_id: string;
          revision: number;
          seller_id: string;
          snapshot_json: Json;
          snapshot_schema_version: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          product_id: string;
          revision?: number;
          seller_id: string;
          snapshot_json: Json;
          snapshot_schema_version?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          product_id?: string;
          revision?: number;
          seller_id?: string;
          snapshot_json?: Json;
          snapshot_schema_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_moderation_working_copies_product_fkey";
            columns: ["product_id", "seller_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "seller_id"];
          },
        ];
      };
      product_moderation_working_copy_images: {
        Row: {
          created_at: string;
          is_cover: boolean;
          position: number;
          product_draft_image_id: string;
          product_id: string;
        };
        Insert: {
          created_at?: string;
          is_cover?: boolean;
          position: number;
          product_draft_image_id: string;
          product_id: string;
        };
        Update: {
          created_at?: string;
          is_cover?: boolean;
          position?: number;
          product_draft_image_id?: string;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_moderation_working_copy_images_source_fkey";
            columns: ["product_id", "product_draft_image_id"];
            isOneToOne: true;
            referencedRelation: "product_draft_images";
            referencedColumns: ["product_draft_id", "id"];
          },
        ];
      };
      products: {
        Row: {
          active_moderation_submission_id: string | null;
          approved_moderation_submission_id: string | null;
          category_id: string | null;
          classifier_group_id: string | null;
          classifier_organization_id: string | null;
          cover_image_id: string | null;
          cover_image_url: string | null;
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          image_gallery_revision: number;
          moderation_revision: number;
          moq: number | null;
          pack_size: string | null;
          price: number | null;
          product_code: string | null;
          seller_id: string;
          status: Database["public"]["Enums"]["product_status"];
          stock: Database["public"]["Enums"]["stock_status"];
          title: string;
          title_source: string | null;
          trending: boolean;
          updated_at: string;
        };
        Insert: {
          active_moderation_submission_id?: string | null;
          approved_moderation_submission_id?: string | null;
          category_id?: string | null;
          classifier_group_id?: string | null;
          classifier_organization_id?: string | null;
          cover_image_id?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          image_gallery_revision?: number;
          moderation_revision?: number;
          moq?: number | null;
          pack_size?: string | null;
          price?: number | null;
          product_code?: string | null;
          seller_id: string;
          status?: Database["public"]["Enums"]["product_status"];
          stock?: Database["public"]["Enums"]["stock_status"];
          title: string;
          title_source?: string | null;
          trending?: boolean;
          updated_at?: string;
        };
        Update: {
          active_moderation_submission_id?: string | null;
          approved_moderation_submission_id?: string | null;
          category_id?: string | null;
          classifier_group_id?: string | null;
          classifier_organization_id?: string | null;
          cover_image_id?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          image_gallery_revision?: number;
          moderation_revision?: number;
          moq?: number | null;
          pack_size?: string | null;
          price?: number | null;
          product_code?: string | null;
          seller_id?: string;
          status?: Database["public"]["Enums"]["product_status"];
          stock?: Database["public"]["Enums"]["stock_status"];
          title?: string;
          title_source?: string | null;
          trending?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_active_moderation_submission_fkey";
            columns: ["active_moderation_submission_id", "id", "seller_id"];
            isOneToOne: false;
            referencedRelation: "product_moderation_submissions";
            referencedColumns: ["id", "product_id", "seller_id"];
          },
          {
            foreignKeyName: "products_approved_moderation_submission_fkey";
            columns: ["approved_moderation_submission_id", "id", "seller_id"];
            isOneToOne: false;
            referencedRelation: "product_moderation_submissions";
            referencedColumns: ["id", "product_id", "seller_id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_cover_draft_image_fkey";
            columns: ["id", "cover_image_id"];
            isOneToOne: false;
            referencedRelation: "product_draft_images";
            referencedColumns: ["product_draft_id", "id"];
          },
          {
            foreignKeyName: "products_product_code_allocation_fkey";
            columns: ["product_code", "id", "seller_id"];
            isOneToOne: false;
            referencedRelation: "product_code_allocations";
            referencedColumns: ["product_code", "product_id", "seller_id"];
          },
          {
            foreignKeyName: "products_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_classifier_batches: {
        Row: {
          classifier_batch_id: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string | null;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number | null;
          max_files: number | null;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        };
        Insert: {
          classifier_batch_id?: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at?: string;
          error_code?: string | null;
          group_count?: number;
          id?: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage?: string;
          max_file_size_bytes?: number | null;
          max_files?: number | null;
          original_file_count?: number;
          processed_file_count?: number;
          product_draft_count?: number;
          provisioning_status?: string;
          retryable?: boolean;
          seller_id: string;
          updated_at?: string;
        };
        Update: {
          classifier_batch_id?: string | null;
          classifier_organization_id?: string;
          client_request_id?: string;
          created_at?: string;
          error_code?: string | null;
          group_count?: number;
          id?: string;
          initiated_by_user_id?: string;
          initiator_kind?: string;
          last_known_stage?: string;
          max_file_size_bytes?: number | null;
          max_files?: number | null;
          original_file_count?: number;
          processed_file_count?: number;
          product_draft_count?: number;
          provisioning_status?: string;
          retryable?: boolean;
          seller_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_classifier_batches_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_profile_assets: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          error_code: string | null;
          id: string;
          kind: string;
          mime_type: string;
          object_key: string;
          original_filename: string;
          prepare_request_id: string;
          seller_id: string;
          size_bytes: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          error_code?: string | null;
          id?: string;
          kind: string;
          mime_type: string;
          object_key: string;
          original_filename: string;
          prepare_request_id: string;
          seller_id: string;
          size_bytes: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          error_code?: string | null;
          id?: string;
          kind?: string;
          mime_type?: string;
          object_key?: string;
          original_filename?: string;
          prepare_request_id?: string;
          seller_id?: string;
          size_bytes?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_profile_assets_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_profile_events: {
        Row: {
          actor_user_id: string;
          created_at: string;
          event_type: string;
          id: string;
          request_id: string;
          seller_id: string;
          seller_visible_reason: string | null;
          storefront_enabled: boolean | null;
          submission_id: string | null;
        };
        Insert: {
          actor_user_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          request_id: string;
          seller_id: string;
          seller_visible_reason?: string | null;
          storefront_enabled?: boolean | null;
          submission_id?: string | null;
        };
        Update: {
          actor_user_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          request_id?: string;
          seller_id?: string;
          seller_visible_reason?: string | null;
          storefront_enabled?: boolean | null;
          submission_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "seller_profile_events_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_profile_events_submission_fkey";
            columns: ["seller_id", "submission_id"];
            isOneToOne: false;
            referencedRelation: "seller_profile_submissions";
            referencedColumns: ["seller_id", "id"];
          },
        ];
      };
      seller_profile_submissions: {
        Row: {
          about: string | null;
          administrator_user_id: string | null;
          city: string | null;
          country: string | null;
          cover_asset_id: string | null;
          created_at: string;
          decided_at: string | null;
          decision_request_id: string | null;
          email: string | null;
          established_year: number | null;
          id: string;
          logo_asset_id: string | null;
          name: string;
          revision: number;
          seller_id: string;
          seller_request_id: string;
          seller_visible_reason: string | null;
          slug: string;
          status: string;
          submission_kind: string;
          submitted_at: string;
          submitted_by_user_id: string;
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          about?: string | null;
          administrator_user_id?: string | null;
          city?: string | null;
          country?: string | null;
          cover_asset_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decision_request_id?: string | null;
          email?: string | null;
          established_year?: number | null;
          id?: string;
          logo_asset_id?: string | null;
          name: string;
          revision: number;
          seller_id: string;
          seller_request_id: string;
          seller_visible_reason?: string | null;
          slug: string;
          status: string;
          submission_kind: string;
          submitted_at?: string;
          submitted_by_user_id: string;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          about?: string | null;
          administrator_user_id?: string | null;
          city?: string | null;
          country?: string | null;
          cover_asset_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decision_request_id?: string | null;
          email?: string | null;
          established_year?: number | null;
          id?: string;
          logo_asset_id?: string | null;
          name?: string;
          revision?: number;
          seller_id?: string;
          seller_request_id?: string;
          seller_visible_reason?: string | null;
          slug?: string;
          status?: string;
          submission_kind?: string;
          submitted_at?: string;
          submitted_by_user_id?: string;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "seller_profile_submissions_cover_asset_fkey";
            columns: ["seller_id", "cover_asset_id"];
            isOneToOne: false;
            referencedRelation: "seller_profile_assets";
            referencedColumns: ["seller_id", "id"];
          },
          {
            foreignKeyName: "seller_profile_submissions_logo_asset_fkey";
            columns: ["seller_id", "logo_asset_id"];
            isOneToOne: false;
            referencedRelation: "seller_profile_assets";
            referencedColumns: ["seller_id", "id"];
          },
          {
            foreignKeyName: "seller_profile_submissions_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_profile_working_copies: {
        Row: {
          about: string | null;
          city: string | null;
          country: string | null;
          cover_asset_id: string | null;
          created_at: string;
          email: string | null;
          established_year: number | null;
          logo_asset_id: string | null;
          name: string;
          revision: number;
          seller_id: string;
          slug: string;
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          about?: string | null;
          city?: string | null;
          country?: string | null;
          cover_asset_id?: string | null;
          created_at?: string;
          email?: string | null;
          established_year?: number | null;
          logo_asset_id?: string | null;
          name: string;
          revision?: number;
          seller_id: string;
          slug: string;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          about?: string | null;
          city?: string | null;
          country?: string | null;
          cover_asset_id?: string | null;
          created_at?: string;
          email?: string | null;
          established_year?: number | null;
          logo_asset_id?: string | null;
          name?: string;
          revision?: number;
          seller_id?: string;
          slug?: string;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "seller_profile_working_copies_cover_asset_fkey";
            columns: ["seller_id", "cover_asset_id"];
            isOneToOne: false;
            referencedRelation: "seller_profile_assets";
            referencedColumns: ["seller_id", "id"];
          },
          {
            foreignKeyName: "seller_profile_working_copies_logo_asset_fkey";
            columns: ["seller_id", "logo_asset_id"];
            isOneToOne: false;
            referencedRelation: "seller_profile_assets";
            referencedColumns: ["seller_id", "id"];
          },
          {
            foreignKeyName: "seller_profile_working_copies_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: true;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_slug_aliases: {
        Row: {
          created_at: string;
          seller_id: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          seller_id: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          seller_id?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_slug_aliases_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      sellers: {
        Row: {
          about: string | null;
          approved_profile_submission_id: string | null;
          city: string | null;
          company_code: string;
          company_code_locked_at: string | null;
          country: string | null;
          cover_image_url: string | null;
          created_at: string;
          email: string | null;
          established_year: number | null;
          id: string;
          logo_url: string | null;
          name: string;
          owner_id: string | null;
          primary_category_id: string | null;
          published: boolean;
          slug: string;
          storefront_enabled: boolean;
          updated_at: string;
          verified: boolean;
          whatsapp: string | null;
        };
        Insert: {
          about?: string | null;
          approved_profile_submission_id?: string | null;
          city?: string | null;
          company_code: string;
          company_code_locked_at?: string | null;
          country?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          email?: string | null;
          established_year?: number | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          owner_id?: string | null;
          primary_category_id?: string | null;
          published?: boolean;
          slug: string;
          storefront_enabled?: boolean;
          updated_at?: string;
          verified?: boolean;
          whatsapp?: string | null;
        };
        Update: {
          about?: string | null;
          approved_profile_submission_id?: string | null;
          city?: string | null;
          company_code?: string;
          company_code_locked_at?: string | null;
          country?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          email?: string | null;
          established_year?: number | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          owner_id?: string | null;
          primary_category_id?: string | null;
          published?: boolean;
          slug?: string;
          storefront_enabled?: boolean;
          updated_at?: string;
          verified?: boolean;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sellers_approved_profile_submission_fkey";
            columns: ["id", "approved_profile_submission_id"];
            isOneToOne: false;
            referencedRelation: "seller_profile_submissions";
            referencedColumns: ["seller_id", "id"];
          },
          {
            foreignKeyName: "sellers_primary_category_id_fkey";
            columns: ["primary_category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_initial_product_draft_description_patch: {
        Args: {
          p_de_description: string;
          p_de_patch_present: boolean;
          p_en_description: string;
          p_en_patch_present: boolean;
          p_expected_moderation_revision: number;
          p_expected_seller_id: string;
          p_pl_description: string;
          p_pl_patch_present: boolean;
          p_product_draft_id: string;
          p_vi_description: string;
          p_vi_patch_present: boolean;
        };
        Returns: {
          moderation_revision: number;
          result: string;
          snapshot: Json;
        }[];
      };
      apply_initial_product_draft_facts_patch: {
        Args: {
          p_expected_moderation_revision: number;
          p_expected_seller_id: string;
          p_normalized_patch: Json;
          p_product_draft_id: string;
        };
        Returns: {
          facts_json: Json;
          facts_revision: number;
          moderation_revision: number;
          product_draft_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          result: string;
          updated_at: string;
        }[];
      };
      apply_product_draft_description_patch: {
        Args: {
          p_de_description: string;
          p_de_patch_present: boolean;
          p_en_description: string;
          p_en_patch_present: boolean;
          p_pl_description: string;
          p_pl_patch_present: boolean;
          p_product_draft_id: string;
          p_vi_description: string;
          p_vi_patch_present: boolean;
        };
        Returns: {
          result: string;
          snapshot: Json;
        }[];
      };
      apply_product_draft_facts_patch: {
        Args: {
          p_expected_seller_id?: string;
          p_normalized_patch: Json;
          p_product_draft_id: string;
        };
        Returns: {
          facts_json: Json;
          facts_revision: number;
          product_draft_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          result: string;
          updated_at: string;
        }[];
      };
      apply_scoped_product_draft_description_patch: {
        Args: {
          p_de_description: string;
          p_de_patch_present: boolean;
          p_en_description: string;
          p_en_patch_present: boolean;
          p_expected_seller_id: string;
          p_pl_description: string;
          p_pl_patch_present: boolean;
          p_product_draft_id: string;
          p_vi_description: string;
          p_vi_patch_present: boolean;
        };
        Returns: {
          result: string;
          snapshot: Json;
        }[];
      };
      archive_initial_product_draft: {
        Args: {
          p_expected_moderation_revision: number;
          p_product_id: string;
          p_seller_id: string;
        };
        Returns: {
          moderation_revision: number;
          product_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          result: string;
        }[];
      };
      archive_seller_product: {
        Args: { p_product_id: string; p_seller_id: string };
        Returns: {
          product_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          result: string;
        }[];
      };
      assert_initial_product_moderation_revision: {
        Args: {
          p_expected_moderation_revision: number;
          p_expected_seller_id: string;
          p_product_id: string;
        };
        Returns: {
          active_moderation_submission_id: string | null;
          approved_moderation_submission_id: string | null;
          category_id: string | null;
          classifier_group_id: string | null;
          classifier_organization_id: string | null;
          cover_image_id: string | null;
          cover_image_url: string | null;
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          image_gallery_revision: number;
          moderation_revision: number;
          moq: number | null;
          pack_size: string | null;
          price: number | null;
          product_code: string | null;
          seller_id: string;
          status: Database["public"]["Enums"]["product_status"];
          stock: Database["public"]["Enums"]["stock_status"];
          title: string;
          title_source: string | null;
          trending: boolean;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "products";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      assign_product_code_for_publication: {
        Args: { p_product_id: string; p_seller_id: string };
        Returns: string;
      };
      authorize_product_publication_with_correlation: {
        Args: {
          p_audiences: string[];
          p_category_id: string;
          p_cover_image_url: string;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_delegated_action_request_fingerprint: string;
          p_delegated_action_request_id: string;
          p_description: string;
          p_description_patch_present: boolean;
          p_moq: number;
          p_pack_size: string;
          p_price: number;
          p_product_draft_id: string;
          p_seller_id: string;
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          product_draft_id: string;
          publication_status: string;
          result: string;
        }[];
      };
      authorize_product_publication_with_correlation_0039a_legacy: {
        Args: {
          p_category_id: string;
          p_cover_image_url: string;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_delegated_action_request_fingerprint: string;
          p_delegated_action_request_id: string;
          p_description: string;
          p_description_patch_present: boolean;
          p_moq: number;
          p_pack_size: string;
          p_price: number;
          p_product_draft_id: string;
          p_seller_id: string;
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          product_draft_id: string;
          publication_status: string;
          result: string;
        }[];
      };
      authorize_seller_product_publication: {
        Args: {
          p_category_id: string;
          p_cover_image_url: string;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string;
          p_description_patch_present: boolean;
          p_moq: number;
          p_pack_size: string;
          p_price: number;
          p_product_draft_id: string;
          p_seller_id: string;
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          product_draft_id: string;
          publication_status: string;
          result: string;
        }[];
      };
      authorize_seller_product_publication_0027d_legacy: {
        Args: {
          p_category_id: string;
          p_cover_image_url: string;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string;
          p_description_patch_present: boolean;
          p_moq: number;
          p_pack_size: string;
          p_price: number;
          p_product_draft_id: string;
          p_seller_id: string;
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          product_draft_id: string;
          publication_status: string;
          result: string;
        }[];
      };
      authorize_seller_product_publication_0040a3_legacy: {
        Args: {
          p_category_id: string;
          p_cover_image_url: string;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string;
          p_description_patch_present: boolean;
          p_moq: number;
          p_pack_size: string;
          p_price: number;
          p_product_draft_id: string;
          p_seller_id: string;
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          product_draft_id: string;
          publication_status: string;
          result: string;
        }[];
      };
      begin_initial_product_draft_image_removal: {
        Args: {
          p_expected_gallery_revision: number;
          p_expected_moderation_revision: number;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      begin_product_draft_image_storage_cutover_scan_phase: {
        Args: {
          p_attempt_token: string;
          p_expected_phase: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          p_next_phase: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          p_version: string;
        };
        Returns: boolean;
      };
      begin_seller_product_draft_image_removal: {
        Args: {
          p_expected_gallery_revision: number;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      begin_seller_profile_asset_removal: {
        Args: { p_asset_id: string; p_seller_id: string };
        Returns: Json;
      };
      bump_initial_product_moderation_revision: {
        Args: { p_product_id: string };
        Returns: undefined;
      };
      claim_classifier_image_promotion: {
        Args: {
          p_claim_timeout_seconds: number;
          p_import_id: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
        };
        Returns: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          classifier_batch_id: string;
          classifier_group_id: string;
          classifier_image_id: string;
          classifier_organization_id: string;
          created_at: string;
          destination_size_bytes: number | null;
          error_code: string | null;
          id: string;
          is_source_cover: boolean;
          last_attempt_at: string | null;
          product_draft_id: string;
          product_draft_image_id: string;
          promoted_at: string | null;
          retryable: boolean;
          source_content_length: number | null;
          status: Database["public"]["Enums"]["product_draft_image_promotion_status"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "product_draft_image_promotions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_classifier_import_run: {
        Args: { p_import_id: string; p_lease_timeout_seconds: number };
        Returns: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          classifier_batch_id: string;
          classifier_organization_id: string;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          id: string;
          last_heartbeat_at: string | null;
          operation_kind: Database["public"]["Enums"]["classifier_import_operation_kind"];
          pipeline_version: string | null;
          requested_by_user_id: string | null;
          retry_policy: Database["public"]["Enums"]["classifier_import_retry_policy"];
          retryable: boolean;
          seller_classifier_workflow_id: string | null;
          seller_id: string;
          status: Database["public"]["Enums"]["classifier_import_status"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "classifier_import_runs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_delegated_administrator_action: {
        Args: {
          p_action_type: string;
          p_administrator_user_id: string;
          p_lease_timeout_seconds: number;
          p_request_fingerprint: string;
          p_request_id: string;
          p_target_id: string;
          p_workflow_id: string;
        };
        Returns: {
          attempt_count: number;
          attempt_token: string;
          error_code: string;
          operation_result: string;
          seller_id: string;
          status: string;
          target_id: string;
        }[];
      };
      claim_next_classifier_import_run: {
        Args: { p_lease_timeout_seconds: number };
        Returns: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          classifier_batch_id: string;
          classifier_organization_id: string;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          id: string;
          last_heartbeat_at: string | null;
          operation_kind: Database["public"]["Enums"]["classifier_import_operation_kind"];
          pipeline_version: string | null;
          requested_by_user_id: string | null;
          retry_policy: Database["public"]["Enums"]["classifier_import_retry_policy"];
          retryable: boolean;
          seller_classifier_workflow_id: string | null;
          seller_id: string;
          status: Database["public"]["Enums"]["classifier_import_status"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "classifier_import_runs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_next_product_draft_image_storage_reconciliation: {
        Args: {
          p_claim_timeout_seconds: number;
          p_cutover_attempt_token: string;
          p_version: string;
        };
        Returns: {
          attempt_count: number;
          attempt_token: string;
          classifier_batch_id: string;
          classifier_group_id: string;
          classifier_image_id: string;
          classifier_organization_id: string;
          content_type: string;
          destination_key: string;
          image_status: Database["public"]["Enums"]["product_draft_image_status"];
          product_draft_image_id: string;
          public_object_state: Database["public"]["Enums"]["product_draft_image_public_object_state"];
          reconciliation_status: Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"];
          size_bytes: number;
          source_content_length: number;
          storage_bucket: string;
        }[];
      };
      claim_product_draft_description_generation: {
        Args: { p_expected_seller_id: string; p_product_draft_id: string };
        Returns: {
          attempt_token: string;
          category_id: string;
          category_name: string;
          category_slug: string;
          cover_content_type: string;
          cover_image_id: string;
          cover_image_url: string;
          cover_object_key: string;
          cover_size_bytes: number;
          cover_source: string;
          cover_storage_bucket: string;
          facts_json: Json;
          facts_revision: number;
          human_languages: string[];
          result: string;
          title_blank: boolean;
        }[];
      };
      claim_product_draft_description_generation_unmoderated: {
        Args: { p_expected_seller_id: string; p_product_draft_id: string };
        Returns: {
          attempt_token: string;
          category_id: string;
          category_name: string;
          category_slug: string;
          cover_content_type: string;
          cover_image_id: string;
          cover_image_url: string;
          cover_object_key: string;
          cover_size_bytes: number;
          cover_source: string;
          cover_storage_bucket: string;
          facts_json: Json;
          facts_revision: number;
          human_languages: string[];
          result: string;
          title_blank: boolean;
        }[];
      };
      claim_product_draft_image_storage_cutover: {
        Args: { p_claim_timeout_seconds: number; p_version: string };
        Returns: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          completed_at: string | null;
          completed_count: number;
          created_at: string;
          error_code: string | null;
          failed_count: number;
          last_attempt_at: string | null;
          pending_count: number;
          release_blocking_count: number;
          scan_cursor: string | null;
          scan_phase: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          started_at: string | null;
          started_count: number;
          status: Database["public"]["Enums"]["product_draft_image_storage_cutover_status"];
          updated_at: string;
          version: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "product_draft_image_storage_cutovers";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_product_image_publication: {
        Args: { p_claim_timeout_seconds: number; p_product_draft_id: string };
        Returns: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          completed_at: string | null;
          created_at: string;
          delegated_action_request_fingerprint: string | null;
          delegated_action_request_id: string | null;
          error_code: string | null;
          product_draft_id: string;
          seller_id: string;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "product_image_publication_runs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_seller_classifier_batch_provisioning_retry: {
        Args: { p_seller_id: string; p_workflow_id: string };
        Returns: {
          classifier_batch_id: string;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number;
          max_files: number;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      claim_seller_profile_asset_cleanup_retry: {
        Args: { p_asset_id: string; p_seller_id: string };
        Returns: Json;
      };
      classifier_import_image_action_state: {
        Args: { p_import_id: string };
        Returns: {
          has_any_failures: boolean;
          has_promoted_images: boolean;
          has_retryable_failures: boolean;
        }[];
      };
      classifier_import_reset_failed_promotions: {
        Args: { p_import_id: string; p_include_non_retryable: boolean };
        Returns: string[];
      };
      clear_product_image_publication_object_ownership: {
        Args: {
          p_attempt_token: string;
          p_created_attempt_token: string;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
        };
        Returns: boolean;
      };
      complete_initial_product_draft_image_removal: {
        Args: {
          p_expected_moderation_revision: number;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      complete_initial_product_draft_image_upload_cleanup: {
        Args: {
          p_expected_moderation_revision: number;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      complete_product_draft_image_storage_cutover: {
        Args: { p_attempt_token: string; p_version: string };
        Returns: boolean;
      };
      complete_product_image_publication_cleanup: {
        Args: {
          p_created_attempt_token: string;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
        };
        Returns: boolean;
      };
      complete_seller_classifier_batch_provisioning: {
        Args: {
          p_classifier_batch_id: string;
          p_max_file_size_bytes: number;
          p_max_files: number;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number;
          max_files: number;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      complete_seller_product_draft_image_removal: {
        Args: {
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      complete_seller_product_draft_image_upload_cleanup: {
        Args: {
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      complete_seller_profile_asset_removal: {
        Args: { p_asset_id: string; p_seller_id: string };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          error_code: string | null;
          id: string;
          kind: string;
          mime_type: string;
          object_key: string;
          original_filename: string;
          prepare_request_id: string;
          seller_id: string;
          size_bytes: number;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "seller_profile_assets";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_seller_profile_asset_upload: {
        Args: {
          p_asset_id: string;
          p_seller_id: string;
          p_verified_mime_type: string;
          p_verified_size_bytes: number;
        };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          error_code: string | null;
          id: string;
          kind: string;
          mime_type: string;
          object_key: string;
          original_filename: string;
          prepare_request_id: string;
          seller_id: string;
          size_bytes: number;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "seller_profile_assets";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      create_or_get_owned_classifier_import: {
        Args: {
          p_classifier_batch_id: string;
          p_classifier_organization_id: string;
          p_requested_by_user_id: string;
          p_seller_id: string;
          p_workflow_id: string;
        };
        Returns: {
          attempt_count: number;
          attempt_token: string;
          claim_started_at: string;
          classifier_batch_id: string;
          classifier_organization_id: string;
          completed_at: string;
          created_at: string;
          error_code: string;
          id: string;
          last_heartbeat_at: string;
          operation_kind: Database["public"]["Enums"]["classifier_import_operation_kind"];
          operation_result: string;
          pipeline_version: string;
          requested_by_user_id: string;
          retry_policy: Database["public"]["Enums"]["classifier_import_retry_policy"];
          retryable: boolean;
          seller_classifier_workflow_id: string;
          seller_id: string;
          status: Database["public"]["Enums"]["classifier_import_status"];
          updated_at: string;
        }[];
      };
      create_or_get_seller_classifier_batch: {
        Args: {
          p_classifier_organization_id: string;
          p_client_request_id: string;
          p_initiated_by_user_id: string;
          p_initiator_kind: string;
          p_seller_id: string;
        };
        Returns: {
          classifier_batch_id: string;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number;
          max_files: number;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      create_seller_product_with_description: {
        Args: {
          p_category_id: string;
          p_cover_image_url: string;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string;
          p_description_patch_present: boolean;
          p_moq: number;
          p_pack_size: string;
          p_price: number;
          p_seller_id: string;
          p_status: Database["public"]["Enums"]["product_status"];
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          english_description: string;
          product_code: string;
          product_draft_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          result: string;
          title: string;
          title_source: string;
        }[];
      };
      create_seller_product_with_description_0027d_legacy: {
        Args: {
          p_category_id: string;
          p_cover_image_url: string;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string;
          p_description_patch_present: boolean;
          p_moq: number;
          p_pack_size: string;
          p_price: number;
          p_seller_id: string;
          p_status: Database["public"]["Enums"]["product_status"];
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          english_description: string;
          product_code: string;
          product_draft_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          result: string;
          title: string;
          title_source: string;
        }[];
      };
      create_seller_with_company_code: {
        Args: {
          p_city: string;
          p_country: string;
          p_name: string;
          p_owner_id: string;
          p_primary_category_id: string;
          p_slug_base: string;
          p_submitted_company_code: string;
          p_whatsapp: string;
        };
        Returns: {
          about: string | null;
          approved_profile_submission_id: string | null;
          city: string | null;
          company_code: string;
          company_code_locked_at: string | null;
          country: string | null;
          cover_image_url: string | null;
          created_at: string;
          email: string | null;
          established_year: number | null;
          id: string;
          logo_url: string | null;
          name: string;
          owner_id: string | null;
          primary_category_id: string | null;
          published: boolean;
          slug: string;
          storefront_enabled: boolean;
          updated_at: string;
          verified: boolean;
          whatsapp: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "sellers";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      create_seller_with_company_code_0040a1_legacy: {
        Args: {
          p_city: string;
          p_country: string;
          p_name: string;
          p_owner_id: string;
          p_primary_category_id: string;
          p_slug_base: string;
          p_submitted_company_code: string;
          p_whatsapp: string;
        };
        Returns: {
          about: string | null;
          approved_profile_submission_id: string | null;
          city: string | null;
          company_code: string;
          company_code_locked_at: string | null;
          country: string | null;
          cover_image_url: string | null;
          created_at: string;
          email: string | null;
          established_year: number | null;
          id: string;
          logo_url: string | null;
          name: string;
          owner_id: string | null;
          primary_category_id: string | null;
          published: boolean;
          slug: string;
          storefront_enabled: boolean;
          updated_at: string;
          verified: boolean;
          whatsapp: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "sellers";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      decide_seller_profile_submission: {
        Args: {
          p_administrator_user_id: string;
          p_decision: string;
          p_decision_request_id: string;
          p_expected_revision: number;
          p_reason: string;
          p_seller_id: string;
          p_submission_id: string;
        };
        Returns: {
          about: string | null;
          administrator_user_id: string | null;
          city: string | null;
          country: string | null;
          cover_asset_id: string | null;
          created_at: string;
          decided_at: string | null;
          decision_request_id: string | null;
          email: string | null;
          established_year: number | null;
          id: string;
          logo_asset_id: string | null;
          name: string;
          revision: number;
          seller_id: string;
          seller_request_id: string;
          seller_visible_reason: string | null;
          slug: string;
          status: string;
          submission_kind: string;
          submitted_at: string;
          submitted_by_user_id: string;
          updated_at: string;
          whatsapp: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "seller_profile_submissions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      derive_company_code_base: {
        Args: { p_company_name: string };
        Returns: string;
      };
      fail_claimed_product_image_publication: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_product_draft_id: string;
        };
        Returns: boolean;
      };
      fail_initial_product_draft_image_removal: {
        Args: {
          p_expected_moderation_revision: number;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      fail_initial_product_draft_image_upload_cleanup: {
        Args: {
          p_expected_moderation_revision: number;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      fail_product_draft_description_generation: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_expected_seller_id: string;
          p_product_draft_id: string;
        };
        Returns: string;
      };
      fail_product_draft_image_storage_cutover: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_version: string;
        };
        Returns: boolean;
      };
      fail_product_image_publication_attempt: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
        };
        Returns: boolean;
      };
      fail_seller_classifier_batch_provisioning: {
        Args: {
          p_error_code: string;
          p_retryable: boolean;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number;
          max_files: number;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      fail_seller_product_draft_image_removal: {
        Args: {
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      fail_seller_product_draft_image_upload_cleanup: {
        Args: {
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      fail_seller_profile_asset_removal: {
        Args: { p_asset_id: string; p_seller_id: string };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          error_code: string | null;
          id: string;
          kind: string;
          mime_type: string;
          object_key: string;
          original_filename: string;
          prepare_request_id: string;
          seller_id: string;
          size_bytes: number;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "seller_profile_assets";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      fail_seller_profile_asset_validation: {
        Args: { p_asset_id: string; p_seller_id: string };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          error_code: string | null;
          id: string;
          kind: string;
          mime_type: string;
          object_key: string;
          original_filename: string;
          prepare_request_id: string;
          seller_id: string;
          size_bytes: number;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "seller_profile_assets";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      finalize_classifier_image_promotion_failure: {
        Args: {
          p_error_code: string;
          p_import_id: string;
          p_promotion_attempt_token: string;
          p_promotion_id: string;
          p_retryable: boolean;
          p_run_attempt_token: string;
        };
        Returns: boolean;
      };
      finalize_classifier_image_promotion_success: {
        Args: {
          p_destination_size_bytes: number;
          p_import_id: string;
          p_promotion_attempt_token: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
        };
        Returns: boolean;
      };
      finalize_classifier_import_run: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_import_id: string;
          p_retryable: boolean;
          p_status: Database["public"]["Enums"]["classifier_import_status"];
        };
        Returns: boolean;
      };
      finalize_delegated_administrator_action_failure: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_request_id: string;
        };
        Returns: boolean;
      };
      finalize_delegated_administrator_action_success: {
        Args: { p_attempt_token: string; p_request_id: string };
        Returns: boolean;
      };
      finalize_initial_product_draft_image_uploads: {
        Args: {
          p_expected_moderation_revision: number;
          p_product_draft_id: string;
          p_results: Json;
          p_seller_id: string;
        };
        Returns: Json;
      };
      finalize_product_draft_description_generation: {
        Args: {
          p_attempt_token: string;
          p_descriptions: Json;
          p_expected_category_id: string;
          p_expected_cover_content_type: string;
          p_expected_cover_image_id: string;
          p_expected_cover_image_url: string;
          p_expected_cover_object_key: string;
          p_expected_cover_size_bytes: number;
          p_expected_cover_source: string;
          p_expected_cover_storage_bucket: string;
          p_expected_facts_revision: number;
          p_expected_seller_id: string;
          p_generated_at: string;
          p_model: string;
          p_pipeline_version: string;
          p_product_draft_id: string;
          p_provider: string;
          p_title_proposal: string;
        };
        Returns: {
          description_snapshot: Json;
          result: string;
          title_snapshot: Json;
        }[];
      };
      finalize_product_draft_description_generation_0027d_legacy: {
        Args: {
          p_attempt_token: string;
          p_descriptions: Json;
          p_expected_category_id: string;
          p_expected_cover_content_type: string;
          p_expected_cover_image_id: string;
          p_expected_cover_image_url: string;
          p_expected_cover_object_key: string;
          p_expected_cover_size_bytes: number;
          p_expected_cover_source: string;
          p_expected_cover_storage_bucket: string;
          p_expected_facts_revision: number;
          p_expected_seller_id: string;
          p_generated_at: string;
          p_model: string;
          p_pipeline_version: string;
          p_product_draft_id: string;
          p_provider: string;
          p_title_proposal: string;
        };
        Returns: {
          description_snapshot: Json;
          result: string;
          title_snapshot: Json;
        }[];
      };
      finalize_product_draft_description_generation_unmoderated: {
        Args: {
          p_attempt_token: string;
          p_descriptions: Json;
          p_expected_category_id: string;
          p_expected_cover_content_type: string;
          p_expected_cover_image_id: string;
          p_expected_cover_image_url: string;
          p_expected_cover_object_key: string;
          p_expected_cover_size_bytes: number;
          p_expected_cover_source: string;
          p_expected_cover_storage_bucket: string;
          p_expected_facts_revision: number;
          p_expected_seller_id: string;
          p_generated_at: string;
          p_model: string;
          p_pipeline_version: string;
          p_product_draft_id: string;
          p_provider: string;
          p_title_proposal: string;
        };
        Returns: {
          description_snapshot: Json;
          result: string;
          title_snapshot: Json;
        }[];
      };
      finalize_product_draft_image_storage_reconciliation: {
        Args: {
          p_cutover_attempt_token: string;
          p_destination_key: string;
          p_error_code: string;
          p_public_object_state: Database["public"]["Enums"]["product_draft_image_public_object_state"];
          p_reconciliation_attempt_token: string;
          p_release_blocking: boolean;
          p_retryable: boolean;
          p_set_private_bucket: boolean;
          p_status: Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"];
          p_version: string;
        };
        Returns: boolean;
      };
      finalize_product_image_publication_cleanup: {
        Args: { p_product_draft_id: string };
        Returns: boolean;
      };
      finalize_seller_product_draft_image_uploads: {
        Args: {
          p_product_draft_id: string;
          p_results: Json;
          p_seller_id: string;
        };
        Returns: Json;
      };
      finalize_seller_product_publication: {
        Args: {
          p_attempt_token: string;
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      finalize_seller_product_publication_0035a1_legacy: {
        Args: {
          p_attempt_token: string;
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      finalize_seller_product_publication_0036a_legacy: {
        Args: {
          p_attempt_token: string;
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      finalize_seller_product_publication_0039a_legacy: {
        Args: {
          p_attempt_token: string;
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      finalize_seller_product_publication_0040a3_legacy: {
        Args: {
          p_attempt_token: string;
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      get_classifier_import_action_state: {
        Args: { p_import_id: string };
        Returns: {
          can_reconcile: boolean;
          can_retry_all: boolean;
          can_retry_temporary: boolean;
        }[];
      };
      get_owned_seller_classifier_import: {
        Args: { p_seller_id: string; p_workflow_id: string };
        Returns: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          classifier_batch_id: string;
          classifier_organization_id: string;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          id: string;
          last_heartbeat_at: string | null;
          operation_kind: Database["public"]["Enums"]["classifier_import_operation_kind"];
          pipeline_version: string | null;
          requested_by_user_id: string | null;
          retry_policy: Database["public"]["Enums"]["classifier_import_retry_policy"];
          retryable: boolean;
          seller_classifier_workflow_id: string | null;
          seller_id: string;
          status: Database["public"]["Enums"]["classifier_import_status"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "classifier_import_runs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_public_product_description: {
        Args: { p_language: string; p_product_id: string };
        Returns: {
          description_text: string;
          resolved_language: string;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      heartbeat_classifier_import_run: {
        Args: { p_attempt_token: string; p_import_id: string };
        Returns: boolean;
      };
      heartbeat_product_draft_image_storage_cutover: {
        Args: { p_attempt_token: string; p_version: string };
        Returns: boolean;
      };
      is_valid_product_draft_facts_v2: {
        Args: { p_facts: Json };
        Returns: boolean;
      };
      list_legacy_product_draft_public_object_keys: {
        Args: { p_cursor: string; p_limit: number };
        Returns: {
          destination_key: string;
        }[];
      };
      list_owned_classifier_import_product_drafts: {
        Args: { p_import_ids: string[]; p_seller_id: string };
        Returns: {
          classifier_group_id: string;
          classifier_import_run_id: string;
          product_draft_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          seller_classifier_workflow_id: string;
          source_group_position: number;
          title: string;
        }[];
      };
      list_public_audience_sellers: {
        Args: { p_audience: string; p_limit?: number };
        Returns: {
          id: string;
          logo_url: string;
          name: string;
          slug: string;
        }[];
      };
      list_public_category_products: {
        Args: { p_audience: string; p_category_slug: string; p_limit?: number };
        Returns: {
          cover_image_url: string;
          created_at: string;
          currency: string;
          id: string;
          moq: number;
          pack_size: string;
          price: number;
          seller_id: string;
          stock: Database["public"]["Enums"]["stock_status"];
          title: string;
        }[];
      };
      list_public_category_sellers: {
        Args: { p_audience: string; p_category_slug: string; p_limit?: number };
        Returns: {
          city: string;
          country: string;
          cover_image_url: string;
          id: string;
          logo_url: string;
          name: string;
          slug: string;
          verified: boolean;
        }[];
      };
      list_public_clothing_categories: {
        Args: { p_audience: string; p_limit?: number };
        Returns: {
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        }[];
      };
      list_public_featured_sellers: {
        Args: { p_audience: string; p_limit?: number };
        Returns: {
          city: string;
          country: string;
          cover_image_url: string;
          id: string;
          logo_url: string;
          name: string;
          primary_category_id: string;
          primary_category_name: string;
          primary_category_slug: string;
          slug: string;
          verified: boolean;
        }[];
      };
      list_public_seller_products: {
        Args: { p_audience: string; p_limit?: number; p_seller_slug: string };
        Returns: {
          category_id: string;
          category_name: string;
          category_slug: string;
          cover_image_url: string;
          created_at: string;
          currency: string;
          id: string;
          moq: number;
          pack_size: string;
          price: number;
          stock: Database["public"]["Enums"]["stock_status"];
          title: string;
        }[];
      };
      list_public_trending_products: {
        Args: { p_audience: string; p_limit?: number };
        Returns: {
          cover_image_url: string;
          created_at: string;
          currency: string;
          id: string;
          moq: number;
          pack_size: string;
          price: number;
          seller_id: string;
          seller_name: string;
          seller_slug: string;
          stock: Database["public"]["Enums"]["stock_status"];
          title: string;
        }[];
      };
      mark_classifier_image_promotion_conflict: {
        Args: {
          p_import_id: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
        };
        Returns: boolean;
      };
      mark_product_image_publication_dispatch_failed: {
        Args: { p_product_draft_id: string };
        Returns: boolean;
      };
      normalize_product_audience_set: {
        Args: { p_audiences: string[] };
        Returns: string[];
      };
      normalize_product_draft_description: {
        Args: { p_value: string };
        Returns: string;
      };
      normalize_public_catalog_audience: {
        Args: { p_audience: string };
        Returns: string;
      };
      prepare_classifier_import_group: {
        Args: {
          p_approved_category_slug: string;
          p_attempt_token: string;
          p_classifier_group_id: string;
          p_import_id: string;
          p_source_cover_classifier_image_id: string;
        };
        Returns: {
          product_draft_id: string;
          result: string;
        }[];
      };
      prepare_classifier_import_group_at_position: {
        Args: {
          p_approved_category_slug: string;
          p_attempt_token: string;
          p_classifier_group_id: string;
          p_import_id: string;
          p_source_cover_classifier_image_id: string;
          p_source_group_position: number;
        };
        Returns: {
          product_draft_id: string;
          result: string;
        }[];
      };
      prepare_classifier_import_group_images: {
        Args: {
          p_classifier_group_id: string;
          p_cover_classifier_image_id: string;
          p_import_id: string;
          p_memberships: Json;
          p_run_attempt_token: string;
        };
        Returns: {
          product_draft_id: string;
          result: string;
        }[];
      };
      prepare_classifier_import_group_images_0028b1_legacy: {
        Args: {
          p_classifier_group_id: string;
          p_cover_classifier_image_id: string;
          p_import_id: string;
          p_memberships: Json;
          p_run_attempt_token: string;
        };
        Returns: {
          product_draft_id: string;
          result: string;
        }[];
      };
      prepare_initial_product_draft_image_uploads: {
        Args: {
          p_expected_gallery_revision: number;
          p_expected_moderation_revision: number;
          p_files: Json;
          p_product_draft_id: string;
          p_seller_id: string;
          p_verified_absent_image_ids?: string[];
        };
        Returns: Json;
      };
      prepare_seller_product_draft_image_uploads: {
        Args: {
          p_expected_gallery_revision: number;
          p_files: Json;
          p_product_draft_id: string;
          p_seller_id: string;
          p_verified_absent_image_ids?: string[];
        };
        Returns: Json;
      };
      prepare_seller_profile_asset_upload: {
        Args: {
          p_kind: string;
          p_mime_type: string;
          p_original_filename: string;
          p_prepare_request_id: string;
          p_seller_id: string;
          p_size_bytes: number;
        };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          error_code: string | null;
          id: string;
          kind: string;
          mime_type: string;
          object_key: string;
          original_filename: string;
          prepare_request_id: string;
          seller_id: string;
          size_bytes: number;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "seller_profile_assets";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      product_draft_description_snapshot: {
        Args: {
          p_category_id: string;
          p_current_facts_revision: number;
          p_product_draft_id: string;
          p_product_status: Database["public"]["Enums"]["product_status"];
        };
        Returns: Json;
      };
      product_draft_image_gallery_snapshot: {
        Args: { p_product_draft_id: string };
        Returns: Json;
      };
      product_moderation_registry_add: {
        Args: { p_product_id: string; p_setting_name: string };
        Returns: undefined;
      };
      product_moderation_registry_contains: {
        Args: { p_product_id: string; p_setting_name: string };
        Returns: boolean;
      };
      project_classifier_import_to_seller_workflow: {
        Args: { p_import_id: string };
        Returns: boolean;
      };
      read_initial_product_moderation_state: {
        Args: { p_product_id: string; p_seller_id: string };
        Returns: {
          active_submission_id: string;
          active_submission_revision: number;
          active_submission_snapshot: Json;
          active_submission_status: string;
          active_submission_submitted_at: string;
          moderation_revision: number;
          product_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          seller_approved: boolean;
          seller_id: string;
        }[];
      };
      read_public_seller_profile_asset: {
        Args: { p_kind: string; p_revision: number; p_seller_id: string };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          error_code: string | null;
          id: string;
          kind: string;
          mime_type: string;
          object_key: string;
          original_filename: string;
          prepare_request_id: string;
          seller_id: string;
          size_bytes: number;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "seller_profile_assets";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      read_seller_profile_moderation_snapshot: {
        Args: { p_seller_id: string };
        Returns: Json;
      };
      read_seller_profile_working_copy: {
        Args: { p_seller_id: string };
        Returns: {
          about: string | null;
          city: string | null;
          country: string | null;
          cover_asset_id: string | null;
          created_at: string;
          email: string | null;
          established_year: number | null;
          logo_asset_id: string | null;
          name: string;
          revision: number;
          seller_id: string;
          slug: string;
          updated_at: string;
          whatsapp: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "seller_profile_working_copies";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      reconcile_classifier_import: {
        Args: { p_import_id: string };
        Returns: string;
      };
      record_product_draft_image_storage_scan_object: {
        Args: {
          p_cutover_attempt_token: string;
          p_destination_key: string;
          p_version: string;
        };
        Returns: string;
      };
      record_product_image_publication_object_created: {
        Args: {
          p_attempt_token: string;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_public_url: string;
          p_source_sha256: string;
        };
        Returns: boolean;
      };
      record_seller_classifier_batch_approved: {
        Args: {
          p_group_count: number;
          p_seller_id: string;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number;
          max_files: number;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      record_seller_classifier_batch_observation: {
        Args: {
          p_error_code: string;
          p_observation_kind: string;
          p_original_file_count: number;
          p_processed_file_count: number;
          p_retryable: boolean;
          p_seller_id: string;
          p_stage: string;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number;
          max_files: number;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      record_seller_classifier_review_observation: {
        Args: {
          p_group_count: number;
          p_seller_id: string;
          p_stage: string;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number;
          max_files: number;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      replace_product_audience_memberships: {
        Args: {
          p_audiences: string[];
          p_product_id: string;
          p_seller_id: string;
        };
        Returns: {
          audiences: string[];
          result: string;
        }[];
      };
      reserve_product_code: {
        Args: {
          p_product_category_id: string;
          p_product_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      reset_missing_classifier_image_promotion: {
        Args: {
          p_import_id: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
        };
        Returns: boolean;
      };
      resolve_public_seller_slug: {
        Args: { p_slug: string };
        Returns: {
          canonical_slug: string;
          is_alias: boolean;
          seller_id: string;
        }[];
      };
      retry_classifier_import: {
        Args: { p_import_id: string; p_include_non_retryable: boolean };
        Returns: string;
      };
      retry_product_draft_image_storage_reconciliation: {
        Args: { p_destination_key: string; p_version: string };
        Returns: boolean;
      };
      retry_product_image_publication: {
        Args: { p_product_draft_id: string; p_seller_id: string };
        Returns: string;
      };
      retry_product_image_publication_0035a1_legacy: {
        Args: { p_product_draft_id: string; p_seller_id: string };
        Returns: string;
      };
      retry_product_image_publication_0040a3_legacy: {
        Args: { p_product_draft_id: string; p_seller_id: string };
        Returns: string;
      };
      retry_product_publication_with_correlation: {
        Args: {
          p_delegated_action_request_fingerprint: string;
          p_delegated_action_request_id: string;
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      retry_product_publication_with_correlation_0039a_legacy: {
        Args: {
          p_delegated_action_request_fingerprint: string;
          p_delegated_action_request_id: string;
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      save_initial_product_draft_with_description: {
        Args: {
          p_audiences: string[];
          p_category_id: string;
          p_cover_image_url: string;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string;
          p_description_patch_present: boolean;
          p_expected_moderation_revision: number;
          p_moq: number;
          p_pack_size: string;
          p_price: number;
          p_product_draft_id: string;
          p_seller_id: string;
          p_status: Database["public"]["Enums"]["product_status"];
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          english_description: string;
          moderation_revision: number;
          product_draft_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          result: string;
          title: string;
          title_source: string;
        }[];
      };
      save_seller_product_with_description:
        | {
            Args: {
              p_category_id: string;
              p_cover_image_url: string;
              p_cover_image_url_patch_present: boolean;
              p_currency: string;
              p_description: string;
              p_description_patch_present: boolean;
              p_moq: number;
              p_pack_size: string;
              p_price: number;
              p_product_draft_id: string;
              p_seller_id: string;
              p_status: Database["public"]["Enums"]["product_status"];
              p_stock: Database["public"]["Enums"]["stock_status"];
              p_title: string;
              p_title_patch_present: boolean;
              p_trending: boolean;
            };
            Returns: {
              english_description: string;
              product_draft_id: string;
              product_status: Database["public"]["Enums"]["product_status"];
              result: string;
              title: string;
              title_source: string;
            }[];
          }
        | {
            Args: {
              p_audiences: string[];
              p_category_id: string;
              p_cover_image_url: string;
              p_cover_image_url_patch_present: boolean;
              p_currency: string;
              p_description: string;
              p_description_patch_present: boolean;
              p_moq: number;
              p_pack_size: string;
              p_price: number;
              p_product_draft_id: string;
              p_seller_id: string;
              p_status: Database["public"]["Enums"]["product_status"];
              p_stock: Database["public"]["Enums"]["stock_status"];
              p_title: string;
              p_title_patch_present: boolean;
              p_trending: boolean;
            };
            Returns: {
              english_description: string;
              product_draft_id: string;
              product_status: Database["public"]["Enums"]["product_status"];
              result: string;
              title: string;
              title_source: string;
            }[];
          };
      save_seller_product_with_description_0028b1_legacy: {
        Args: {
          p_category_id: string;
          p_cover_image_url: string;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string;
          p_description_patch_present: boolean;
          p_moq: number;
          p_pack_size: string;
          p_price: number;
          p_product_draft_id: string;
          p_seller_id: string;
          p_status: Database["public"]["Enums"]["product_status"];
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          english_description: string;
          product_draft_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          result: string;
          title: string;
          title_source: string;
        }[];
      };
      save_seller_product_with_description_0039a_legacy: {
        Args: {
          p_category_id: string;
          p_cover_image_url: string;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string;
          p_description_patch_present: boolean;
          p_moq: number;
          p_pack_size: string;
          p_price: number;
          p_product_draft_id: string;
          p_seller_id: string;
          p_status: Database["public"]["Enums"]["product_status"];
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          english_description: string;
          product_draft_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          result: string;
          title: string;
          title_source: string;
        }[];
      };
      save_seller_profile_working_copy:
        | {
            Args: {
              p_about: string;
              p_city: string;
              p_country: string;
              p_email: string;
              p_established_year: number;
              p_expected_revision: number;
              p_name: string;
              p_seller_id: string;
              p_slug: string;
              p_whatsapp: string;
            };
            Returns: {
              about: string | null;
              city: string | null;
              country: string | null;
              cover_asset_id: string | null;
              created_at: string;
              email: string | null;
              established_year: number | null;
              logo_asset_id: string | null;
              name: string;
              revision: number;
              seller_id: string;
              slug: string;
              updated_at: string;
              whatsapp: string | null;
            }[];
            SetofOptions: {
              from: "*";
              to: "seller_profile_working_copies";
              isOneToOne: false;
              isSetofReturn: true;
            };
          }
        | {
            Args: {
              p_about: string;
              p_city: string;
              p_country: string;
              p_cover_asset_id: string;
              p_email: string;
              p_established_year: number;
              p_expected_revision: number;
              p_logo_asset_id: string;
              p_name: string;
              p_seller_id: string;
              p_slug: string;
              p_whatsapp: string;
            };
            Returns: {
              about: string | null;
              city: string | null;
              country: string | null;
              cover_asset_id: string | null;
              created_at: string;
              email: string | null;
              established_year: number | null;
              logo_asset_id: string | null;
              name: string;
              revision: number;
              seller_id: string;
              slug: string;
              updated_at: string;
              whatsapp: string | null;
            }[];
            SetofOptions: {
              from: "*";
              to: "seller_profile_working_copies";
              isOneToOne: false;
              isSetofReturn: true;
            };
          };
      search_delegated_upload_sellers: {
        Args: { p_limit: number; p_query: string };
        Returns: {
          name: string;
          published: boolean;
          seller_id: string;
          slug: string;
        }[];
      };
      seller_profile_slug_available: {
        Args: { p_seller_id: string; p_slug: string };
        Returns: boolean;
      };
      set_classifier_image_promotion_source_length: {
        Args: {
          p_import_id: string;
          p_promotion_attempt_token: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
          p_source_content_length: number;
        };
        Returns: boolean;
      };
      set_classifier_import_group_result: {
        Args: {
          p_attempt_token: string;
          p_classifier_group_id: string;
          p_error_code: string;
          p_import_id: string;
          p_retryable: boolean;
          p_status: Database["public"]["Enums"]["classifier_import_group_status"];
        };
        Returns: boolean;
      };
      set_classifier_import_pipeline_version: {
        Args: {
          p_attempt_token: string;
          p_import_id: string;
          p_pipeline_version: string;
        };
        Returns: boolean;
      };
      set_product_draft_image_storage_cutover_scan_progress: {
        Args: {
          p_attempt_token: string;
          p_expected_cursor: string;
          p_next_cursor: string;
          p_scan_phase: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          p_version: string;
        };
        Returns: boolean;
      };
      set_seller_storefront_enabled: {
        Args: {
          p_actor_user_id: string;
          p_enabled: boolean;
          p_request_id: string;
          p_seller_id: string;
        };
        Returns: {
          result: string;
          storefront_enabled: boolean;
        }[];
      };
      submit_initial_product_moderation: {
        Args: {
          p_expected_moderation_revision: number;
          p_product_id: string;
          p_seller_id: string;
          p_seller_request_id: string;
          p_submitted_by_user_id: string;
        };
        Returns: {
          administrator_user_id: string | null;
          created_at: string;
          decided_at: string | null;
          decision_request_id: string | null;
          id: string;
          product_id: string;
          review_status: string;
          revision: number;
          seller_id: string;
          seller_request_id: string;
          seller_visible_reason: string | null;
          snapshot_json: Json;
          snapshot_schema_version: number;
          submission_kind: string;
          submitted_at: string;
          submitted_by_user_id: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "product_moderation_submissions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      submit_seller_profile_working_copy: {
        Args: {
          p_expected_revision: number;
          p_seller_id: string;
          p_seller_request_id: string;
          p_submitted_by_user_id: string;
        };
        Returns: {
          about: string | null;
          administrator_user_id: string | null;
          city: string | null;
          country: string | null;
          cover_asset_id: string | null;
          created_at: string;
          decided_at: string | null;
          decision_request_id: string | null;
          email: string | null;
          established_year: number | null;
          id: string;
          logo_asset_id: string | null;
          name: string;
          revision: number;
          seller_id: string;
          seller_request_id: string;
          seller_visible_reason: string | null;
          slug: string;
          status: string;
          submission_kind: string;
          submitted_at: string;
          submitted_by_user_id: string;
          updated_at: string;
          whatsapp: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "seller_profile_submissions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      update_initial_product_draft_image_gallery: {
        Args: {
          p_cover_image_id: string;
          p_expected_gallery_revision: number;
          p_expected_moderation_revision: number;
          p_ordered_available_image_ids: string[];
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      update_initial_product_draft_title: {
        Args: {
          p_expected_moderation_revision: number;
          p_expected_seller_id: string;
          p_product_draft_id: string;
          p_title: string;
          p_title_source: string;
        };
        Returns: {
          moderation_revision: number;
          product_draft_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          title: string;
          title_source: string;
        }[];
      };
      update_seller_product_draft_image_gallery: {
        Args: {
          p_cover_image_id: string;
          p_expected_gallery_revision: number;
          p_ordered_available_image_ids: string[];
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      update_unlocked_seller_company_code: {
        Args: { p_submitted_company_code: string };
        Returns: {
          about: string | null;
          approved_profile_submission_id: string | null;
          city: string | null;
          company_code: string;
          company_code_locked_at: string | null;
          country: string | null;
          cover_image_url: string | null;
          created_at: string;
          email: string | null;
          established_year: number | null;
          id: string;
          logo_url: string | null;
          name: string;
          owner_id: string | null;
          primary_category_id: string | null;
          published: boolean;
          slug: string;
          storefront_enabled: boolean;
          updated_at: string;
          verified: boolean;
          whatsapp: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "sellers";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      validate_product_audience_release_preflight: {
        Args: never;
        Returns: undefined;
      };
      validate_product_moderation_submission_images: {
        Args: { p_submission_id: string };
        Returns: undefined;
      };
      validate_product_publication_descriptions: {
        Args: {
          p_english_description: string;
          p_english_patch_present: boolean;
          p_product_draft_id: string;
        };
        Returns: string;
      };
      validate_product_publication_title: {
        Args: { p_title: string };
        Returns: {
          normalized_title: string;
          result: string;
        }[];
      };
      validate_seller_profile_media_references: {
        Args: {
          p_cover_asset_id: string;
          p_logo_asset_id: string;
          p_seller_id: string;
        };
        Returns: undefined;
      };
      verify_classifier_image_promotion_claim: {
        Args: {
          p_import_id: string;
          p_promotion_attempt_token: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
        };
        Returns: boolean;
      };
      verify_product_draft_image_storage_reconciliation_claim: {
        Args: {
          p_cutover_attempt_token: string;
          p_destination_key: string;
          p_reconciliation_attempt_token: string;
          p_version: string;
        };
        Returns: boolean;
      };
      verify_product_image_publication_item: {
        Args: {
          p_attempt_token: string;
          p_created_by_current_attempt: boolean;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_public_etag: string;
          p_public_sha256: string;
          p_public_size_bytes: number;
          p_public_url: string;
          p_source_sha256: string;
        };
        Returns: boolean;
      };
      withdraw_initial_product_moderation: {
        Args: {
          p_actor_user_id: string;
          p_expected_moderation_revision: number;
          p_product_id: string;
          p_request_id: string;
          p_seller_id: string;
          p_submission_id: string;
        };
        Returns: {
          administrator_user_id: string | null;
          created_at: string;
          decided_at: string | null;
          decision_request_id: string | null;
          id: string;
          product_id: string;
          review_status: string;
          revision: number;
          seller_id: string;
          seller_request_id: string;
          seller_visible_reason: string | null;
          snapshot_json: Json;
          snapshot_schema_version: number;
          submission_kind: string;
          submitted_at: string;
          submitted_by_user_id: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "product_moderation_submissions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      withdraw_seller_profile_submission: {
        Args: {
          p_actor_user_id: string;
          p_expected_revision: number;
          p_request_id: string;
          p_seller_id: string;
          p_submission_id: string;
        };
        Returns: {
          about: string | null;
          administrator_user_id: string | null;
          city: string | null;
          country: string | null;
          cover_asset_id: string | null;
          created_at: string;
          decided_at: string | null;
          decision_request_id: string | null;
          email: string | null;
          established_year: number | null;
          id: string;
          logo_asset_id: string | null;
          name: string;
          revision: number;
          seller_id: string;
          seller_request_id: string;
          seller_visible_reason: string | null;
          slug: string;
          status: string;
          submission_kind: string;
          submitted_at: string;
          submitted_by_user_id: string;
          updated_at: string;
          whatsapp: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "seller_profile_submissions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
    };
    Enums: {
      app_role: "seller" | "admin";
      classifier_import_group_status: "pending" | "processing" | "complete" | "failed";
      classifier_import_operation_kind: "import" | "reconcile";
      classifier_import_retry_policy: "retryable_only" | "include_non_retryable";
      classifier_import_status:
        "pending" | "running" | "completed" | "completed_with_errors" | "failed";
      lead_source: "form" | "whatsapp";
      product_draft_image_promotion_status: "pending" | "started" | "promoted" | "failed";
      product_draft_image_public_object_state: "unchecked" | "absent" | "deleted" | "unresolved";
      product_draft_image_status: "pending" | "available" | "failed" | "deleting";
      product_draft_image_storage_cutover_scan_phase: "reconciliation" | "discovery" | "confirming";
      product_draft_image_storage_cutover_status: "pending" | "running" | "completed" | "failed";
      product_draft_image_storage_reconciliation_status:
        "pending" | "started" | "completed" | "failed";
      product_status: "draft" | "published" | "archived";
      stock_status: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["seller", "admin"],
      classifier_import_group_status: ["pending", "processing", "complete", "failed"],
      classifier_import_operation_kind: ["import", "reconcile"],
      classifier_import_retry_policy: ["retryable_only", "include_non_retryable"],
      classifier_import_status: [
        "pending",
        "running",
        "completed",
        "completed_with_errors",
        "failed",
      ],
      lead_source: ["form", "whatsapp"],
      product_draft_image_promotion_status: ["pending", "started", "promoted", "failed"],
      product_draft_image_public_object_state: ["unchecked", "absent", "deleted", "unresolved"],
      product_draft_image_status: ["pending", "available", "failed", "deleting"],
      product_draft_image_storage_cutover_scan_phase: ["reconciliation", "discovery", "confirming"],
      product_draft_image_storage_cutover_status: ["pending", "running", "completed", "failed"],
      product_draft_image_storage_reconciliation_status: [
        "pending",
        "started",
        "completed",
        "failed",
      ],
      product_status: ["draft", "published", "archived"],
      stock_status: ["in_stock", "low_stock", "out_of_stock", "made_to_order"],
    },
  },
} as const;
