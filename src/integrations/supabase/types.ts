export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      backups: {
        Row: {
          auto: boolean;
          created_at: string;
          data: Json;
          id: string;
          label: string;
          user_id: string;
        };
        Insert: {
          auto?: boolean;
          created_at?: string;
          data: Json;
          id?: string;
          label?: string;
          user_id: string;
        };
        Update: {
          auto?: boolean;
          created_at?: string;
          data?: Json;
          id?: string;
          label?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sync_docs: {
        Row: {
          data: Json;
          deleted: boolean;
          entity: string;
          record_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          data?: Json;
          deleted?: boolean;
          entity: string;
          record_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          data?: Json;
          deleted?: boolean;
          entity?: string;
          record_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          dark: boolean;
          density: string;
          extras: Json;
          font_scale: string;
          scratch: string;
          theme: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          dark?: boolean;
          density?: string;
          extras?: Json;
          font_scale?: string;
          scratch?: string;
          theme?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          dark?: boolean;
          density?: string;
          extras?: Json;
          font_scale?: string;
          scratch?: string;
          theme?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      secret_gift_config: {
        Row: {
          id: number;
          required_login_days: number;
          gift_title: string;
          gift_description: string;
          custom_message: string;
          image_urls: Json;
          video_urls: Json;
          audio_urls: Json;
          animation_key: string;
          one_time: boolean;
          admin_emails: string[];
          admin_password_hash: string | null;
          admin_session_minutes: number;
          updated_at: string;
        };
        Insert: {
          id?: number;
          required_login_days?: number;
          gift_title?: string;
          gift_description?: string;
          custom_message?: string;
          image_urls?: Json;
          video_urls?: Json;
          audio_urls?: Json;
          animation_key?: string;
          one_time?: boolean;
          admin_emails?: string[];
          admin_password_hash?: string | null;
          admin_session_minutes?: number;
          updated_at?: string;
        };
        Update: {
          id?: number;
          required_login_days?: number;
          gift_title?: string;
          gift_description?: string;
          custom_message?: string;
          image_urls?: Json;
          video_urls?: Json;
          audio_urls?: Json;
          animation_key?: string;
          one_time?: boolean;
          admin_emails?: string[];
          admin_password_hash?: string | null;
          admin_session_minutes?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      secret_gift_progress: {
        Row: {
          user_id: string;
          login_day_count: number;
          last_login_counted_date: string | null;
          first_login_date: string | null;
          gift_unlocked_at: string | null;
          gift_opened_at: string | null;
          notification_seen: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          login_day_count?: number;
          last_login_counted_date?: string | null;
          first_login_date?: string | null;
          gift_unlocked_at?: string | null;
          gift_opened_at?: string | null;
          notification_seen?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          login_day_count?: number;
          last_login_counted_date?: string | null;
          first_login_date?: string | null;
          gift_unlocked_at?: string | null;
          gift_opened_at?: string | null;
          notification_seen?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_current_user: { Args: Record<PropertyKey, never>; Returns: undefined };
      record_secret_gift_login_day: {
        Args: { p_local_date: string };
        Returns: Database["public"]["Tables"]["secret_gift_progress"]["Row"];
      };
      mark_secret_gift_opened: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Tables"]["secret_gift_progress"]["Row"];
      };
      mark_secret_gift_notification_seen: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Tables"]["secret_gift_progress"]["Row"];
      };
      admin_secret_gift_progress_list: {
        Args: Record<PropertyKey, never>;
        Returns: {
          user_id: string;
          display_name: string | null;
          email: string | null;
          login_day_count: number;
          last_login_counted_date: string | null;
          first_login_date: string | null;
          gift_unlocked_at: string | null;
          gift_opened_at: string | null;
          notification_seen: boolean;
          updated_at: string;
          required_login_days: number;
        }[];
      };
      admin_secret_gift_adjust_days: {
        Args: { p_user_id: string; p_delta: number };
        Returns: Database["public"]["Tables"]["secret_gift_progress"]["Row"];
      };
      admin_secret_gift_reset: {
        Args: { p_user_id: string };
        Returns: Database["public"]["Tables"]["secret_gift_progress"]["Row"];
      };
      admin_secret_gift_mark_opened: {
        Args: { p_user_id: string };
        Returns: Database["public"]["Tables"]["secret_gift_progress"]["Row"];
      };
      is_app_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      verify_admin_password: {
        Args: { p_password: string };
        Returns: Json;
      };
      touch_admin_session: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      revoke_admin_session: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      has_valid_admin_session: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
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
  public: {
    Enums: {},
  },
} as const;
