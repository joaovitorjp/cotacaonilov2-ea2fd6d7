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
  public: {
    Tables: {
      access_keys: {
        Row: {
          chave: string
          cliente_contato: string | null
          cliente_nome: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          observacao: string | null
          redeemed_at: string | null
          status: string
          tipo: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          chave: string
          cliente_contato?: string | null
          cliente_nome?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          observacao?: string | null
          redeemed_at?: string | null
          status?: string
          tipo: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          chave?: string
          cliente_contato?: string | null
          cliente_nome?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          observacao?: string | null
          redeemed_at?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      assinaturas: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          mp_preapproval_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          mp_preapproval_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          mp_preapproval_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      avarias: {
        Row: {
          comprador: string
          created_at: string
          data_referencia: string
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          id: string
          loja_nome: string
          loja_numero: string
          quantidade: number
          sessao: string
          upload_id: string
          valor_total: number
        }
        Insert: {
          comprador: string
          created_at?: string
          data_referencia?: string
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          id?: string
          loja_nome: string
          loja_numero: string
          quantidade?: number
          sessao: string
          upload_id: string
          valor_total?: number
        }
        Update: {
          comprador?: string
          created_at?: string
          data_referencia?: string
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          id?: string
          loja_nome?: string
          loja_numero?: string
          quantidade?: number
          sessao?: string
          upload_id?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "avarias_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "avarias_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      avarias_uploads: {
        Row: {
          comprador: string
          created_at: string
          data_referencia: string
          filename: string | null
          id: string
          sessao: string
          total_rows: number
          total_valor: number
          user_id: string
        }
        Insert: {
          comprador: string
          created_at?: string
          data_referencia?: string
          filename?: string | null
          id?: string
          sessao: string
          total_rows?: number
          total_valor?: number
          user_id: string
        }
        Update: {
          comprador?: string
          created_at?: string
          data_referencia?: string
          filename?: string | null
          id?: string
          sessao?: string
          total_rows?: number
          total_valor?: number
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      empresas: {
        Row: {
          cnpj: string | null
          cor_primaria: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          nome: string
          slug: string | null
        }
        Insert: {
          cnpj?: string | null
          cor_primaria?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          slug?: string | null
        }
        Update: {
          cnpj?: string | null
          cor_primaria?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          slug?: string | null
        }
        Relationships: []
      }
      estoques_manuais: {
        Row: {
          created_at: string
          estoque: number
          id: string
          loja: string
          mes: number
          updated_at: string
          user_id: string
          venda: number
        }
        Insert: {
          created_at?: string
          estoque?: number
          id?: string
          loja: string
          mes: number
          updated_at?: string
          user_id: string
          venda?: number
        }
        Update: {
          created_at?: string
          estoque?: number
          id?: string
          loja?: string
          mes?: number
          updated_at?: string
          user_id?: string
          venda?: number
        }
        Relationships: []
      }
      estoques_resultados: {
        Row: {
          codigo_produto: string
          descricao: string | null
          dias_cobertura: number | null
          estoque_atual: number
          id: string
          loja: string
          media_vendas: number
          meses_considerados: number
          updated_at: string
          user_id: string
        }
        Insert: {
          codigo_produto: string
          descricao?: string | null
          dias_cobertura?: number | null
          estoque_atual?: number
          id?: string
          loja: string
          media_vendas?: number
          meses_considerados?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          codigo_produto?: string
          descricao?: string | null
          dias_cobertura?: number | null
          estoque_atual?: number
          id?: string
          loja?: string
          media_vendas?: number
          meses_considerados?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      estoques_uploads: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          loja: string
          referencia: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          loja: string
          referencia?: string | null
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          loja?: string
          referencia?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          codigo_estado: string | null
          codigo_interno: string | null
          codigo_interno_ciss: string | null
          codigo_interno_ciss_go: string | null
          codigo_interno_ciss_mt: string | null
          codigo_interno_consinco: string | null
          codigo_interno_consinco_go: string | null
          codigo_interno_consinco_mt: string | null
          contato: string | null
          created_at: string
          email: string | null
          empresa_id: string
          id: string
          network_id: string | null
          nome: string
          nome_representante: string | null
          user_id: string | null
          whatsapp: string
        }
        Insert: {
          codigo_estado?: string | null
          codigo_interno?: string | null
          codigo_interno_ciss?: string | null
          codigo_interno_ciss_go?: string | null
          codigo_interno_ciss_mt?: string | null
          codigo_interno_consinco?: string | null
          codigo_interno_consinco_go?: string | null
          codigo_interno_consinco_mt?: string | null
          contato?: string | null
          created_at?: string
          email?: string | null
          empresa_id?: string
          id?: string
          network_id?: string | null
          nome: string
          nome_representante?: string | null
          user_id?: string | null
          whatsapp?: string
        }
        Update: {
          codigo_estado?: string | null
          codigo_interno?: string | null
          codigo_interno_ciss?: string | null
          codigo_interno_ciss_go?: string | null
          codigo_interno_ciss_mt?: string | null
          codigo_interno_consinco?: string | null
          codigo_interno_consinco_go?: string | null
          codigo_interno_consinco_mt?: string | null
          contato?: string | null
          created_at?: string
          email?: string | null
          empresa_id?: string
          id?: string
          network_id?: string | null
          nome?: string
          nome_representante?: string | null
          user_id?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedores_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      links_cotacao: {
        Row: {
          condicoes: Json
          created_at: string
          empresa: string
          empresa_id: string
          estados: string
          frete_go: string
          frete_mt: string
          id: string
          info_preco: string | null
          lista_id: string
          network_id: string | null
          respondido: boolean
          tipo_preco: string | null
          tipo_preco_go: string
          tipo_preco_mt: string
          token: string
          user_id: string | null
        }
        Insert: {
          condicoes?: Json
          created_at?: string
          empresa: string
          empresa_id?: string
          estados?: string
          frete_go?: string
          frete_mt?: string
          id?: string
          info_preco?: string | null
          lista_id: string
          network_id?: string | null
          respondido?: boolean
          tipo_preco?: string | null
          tipo_preco_go?: string
          tipo_preco_mt?: string
          token?: string
          user_id?: string | null
        }
        Update: {
          condicoes?: Json
          created_at?: string
          empresa?: string
          empresa_id?: string
          estados?: string
          frete_go?: string
          frete_mt?: string
          id?: string
          info_preco?: string | null
          lista_id?: string
          network_id?: string | null
          respondido?: boolean
          tipo_preco?: string | null
          tipo_preco_go?: string
          tipo_preco_mt?: string
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "links_cotacao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_cotacao_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "listas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_cotacao_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      listas: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          network_id: string | null
          nome: string
          prazo: string | null
          produtos: Json
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          empresa_id?: string
          id?: string
          network_id?: string | null
          nome: string
          prazo?: string | null
          produtos?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          network_id?: string | null
          nome?: string
          prazo?: string | null
          produtos?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listas_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      master_audit_logs: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          network_id: string | null
          performed_by: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          network_id?: string | null
          performed_by?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          network_id?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_audit_logs_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_globais: {
        Row: {
          autor_avatar_path: string | null
          autor_email: string
          autor_nome: string
          content: string
          created_at: string
          id: string
          mentioned_nome: string | null
          mentioned_user_id: string | null
          saved_by: string[]
          shared_lista: Json | null
          user_id: string
        }
        Insert: {
          autor_avatar_path?: string | null
          autor_email?: string
          autor_nome?: string
          content: string
          created_at?: string
          id?: string
          mentioned_nome?: string | null
          mentioned_user_id?: string | null
          saved_by?: string[]
          shared_lista?: Json | null
          user_id: string
        }
        Update: {
          autor_avatar_path?: string | null
          autor_email?: string
          autor_nome?: string
          content?: string
          created_at?: string
          id?: string
          mentioned_nome?: string | null
          mentioned_user_id?: string | null
          saved_by?: string[]
          shared_lista?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      networks: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      price_markups: {
        Row: {
          created_at: string
          empresa: string
          id: string
          lista_id: string
          markup_percent: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          empresa: string
          id?: string
          lista_id: string
          markup_percent?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          empresa?: string
          id?: string
          lista_id?: string
          markup_percent?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_markups_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "listas"
            referencedColumns: ["id"]
          },
        ]
      }
      price_types: {
        Row: {
          empresa: string
          estado: string
          id: string
          lista_id: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          empresa: string
          estado: string
          id?: string
          lista_id: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          empresa?: string
          estado?: string
          id?: string
          lista_id?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cargo: string | null
          created_at: string
          email: string
          empresa_id: string
          estados: string[]
          id: string
          is_super_admin: boolean | null
          network_id: string | null
          nome: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email?: string
          empresa_id?: string
          estados?: string[]
          id?: string
          is_super_admin?: boolean | null
          network_id?: string | null
          nome?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email?: string
          empresa_id?: string
          estados?: string[]
          id?: string
          is_super_admin?: boolean | null
          network_id?: string | null
          nome?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas: {
        Row: {
          created_at: string
          empresa: string
          empresa_id: string
          id: string
          lista_id: string
          network_id: string | null
          resposta: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          empresa: string
          empresa_id?: string
          id?: string
          lista_id: string
          network_id?: string | null
          resposta?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          empresa?: string
          empresa_id?: string
          id?: string
          lista_id?: string
          network_id?: string | null
          resposta?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "respostas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "listas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          created_at: string
          id: string
          mp_payment_id: string | null
          mp_preference_id: string | null
          paid_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          paid_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          paid_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      admin_cancelar_chave: { Args: { _id: string }; Returns: undefined }
      current_empresa_id: { Args: never; Returns: string }
      default_empresa_id: { Args: never; Returns: string }
      enviar_resposta_cotacao: {
        Args: { _resposta: Json; _token: string }
        Returns: string
      }
      get_cotacao_por_token: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      listar_usuarios_chat: {
        Args: never
        Returns: {
          email: string
          nome: string
          user_id: string
        }[]
      }
      resgatar_chave: { Args: { _chave: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
