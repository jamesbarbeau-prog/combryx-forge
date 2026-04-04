export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          trade: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          city: string | null;
          province: string;
          postal_code: string | null;
          logo_url: string | null;
          active_modules: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          trade?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          city?: string | null;
          province?: string;
          postal_code?: string | null;
          logo_url?: string | null;
          active_modules?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['companies']['Insert']>;
      };
      users: {
        Row: {
          id: string;
          company_id: string;
          full_name: string;
          initials: string | null;
          email: string;
          phone: string | null;
          role: string;
          trade: string | null;
          status: string;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          company_id: string;
          full_name: string;
          initials?: string | null;
          email: string;
          phone?: string | null;
          role?: string;
          trade?: string | null;
          status?: string;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      clients: {
        Row: {
          id: string;
          company_id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          address: string | null;
          city: string | null;
          province: string;
          postal_code: string | null;
          property_type: string;
          lead_source: string | null;
          status: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          project_id?: string | null;
          client_id?: string | null;
          call_type?: string;
          issue: string;
          description?: string | null;
          address: string;
          city?: string | null;
          priority?: string;
          status?: string;
          assigned_to?: string | null;
          staff_id?: string | null;
          scheduled_time?: string | null;
          estimated_duration?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['clients']['Insert']>;
      };
      opportunities: {
        Row: {
          id: string;
          company_id: string;
          client_id: string | null;
          name: string;
          description: string | null;
          value: number;
          stage: string;
          probability: number;
          type: string;
          location: string | null;
          assigned_to: string | null;
          due_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          client_id?: string | null;
          name: string;
          description?: string | null;
          value?: number;
          stage?: string;
          probability?: number;
          type?: string;
          location?: string | null;
          assigned_to?: string | null;
          due_date?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['opportunities']['Insert']>;
      };
      projects: {
        Row: {
          id: string;
          company_id: string;
          client_id: string | null;
          opportunity_id: string | null;
          name: string;
          description: string | null;
          address: string | null;
          city: string | null;
          province: string;
          value: number;
          stage: string;
          status: string;
          type: string;
          pm_id: string | null;
          start_date: string | null;
          end_date: string | null;
          completion_pct: number;
          holdback_pct: number;
          holdback_released: boolean;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          client_id?: string | null;
          opportunity_id?: string | null;
          name: string;
          description?: string | null;
          address?: string | null;
          city?: string | null;
          province?: string;
          value?: number;
          stage?: string;
          status?: string;
          type?: string;
          pm_id?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          completion_pct?: number;
          holdback_pct?: number;
          holdback_released?: boolean;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['projects']['Insert']>;
      };
      work_orders: {
        Row: {
          id: string;
          company_id: string;
          project_id: string | null;
          client_id: string | null;
          call_type: string;
          issue: string;
          description: string | null;
          address: string;
          city: string | null;
          priority: string;
          status: string;
          assigned_to: string | null;
staff_id: string | null;
scheduled_time: string | null;
          estimated_duration: string | null;
          completed_at: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          project_id?: string | null;
          client_id?: string | null;
          call_type?: string;
          issue: string;
          description?: string | null;
          address: string;
          city?: string | null;
          priority?: string;
          status?: string;
          assigned_to?: string | null;
          scheduled_time?: string | null;
          estimated_duration?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['work_orders']['Insert']>;
      };
      scope_items: {
        Row: {
          id: string;
          project_id: string;
          section: string;
          description: string;
          item_type: string;
          quantity: number;
          unit: string;
          unit_price: number;
          total: number;
          is_optional: boolean;
          approved: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          section?: string;
          description: string;
          item_type?: string;
          quantity?: number;
          unit?: string;
          unit_price?: number;
          is_optional?: boolean;
          approved?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['scope_items']['Insert']>;
      };
      invoices: {
        Row: {
          id: string;
          company_id: string;
          project_id: string | null;
          client_id: string | null;
          invoice_number: string;
          status: string;
          subtotal: number;
          tax_rate: number;
          tax_amount: number;
          holdback_amount: number;
          total: number;
          amount_paid: number;
          due_date: string | null;
          paid_at: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          project_id?: string | null;
          client_id?: string | null;
          invoice_number: string;
          status?: string;
          subtotal?: number;
          tax_rate?: number;
          tax_amount?: number;
          holdback_amount?: number;
          total?: number;
          amount_paid?: number;
          due_date?: string | null;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>;
      };
      expenses: {
        Row: {
          id: string;
          company_id: string;
          project_id: string | null;
          work_order_id: string | null;
          description: string;
          category: string;
          amount: number;
          vendor: string | null;
          receipt_url: string | null;
          submitted_by: string | null;
          approved: boolean;
          expense_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          project_id?: string | null;
          work_order_id?: string | null;
          description: string;
          category?: string;
          amount?: number;
          vendor?: string | null;
          receipt_url?: string | null;
          submitted_by?: string | null;
          approved?: boolean;
          expense_date?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>;
      };
      field_logs: {
        Row: {
          id: string;
          company_id: string;
          project_id: string | null;
          work_order_id: string | null;
          log_type: string;
          content: string | null;
          photo_url: string | null;
          submitted_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          project_id?: string | null;
          work_order_id?: string | null;
          log_type?: string;
          content?: string | null;
          photo_url?: string | null;
          submitted_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['field_logs']['Insert']>;
      };
      documents: {
        Row: {
          id: string;
          company_id: string;
          project_id: string | null;
          client_id: string | null;
          doc_type: string;
          name: string;
          file_url: string | null;
          signed: boolean;
          signed_at: string | null;
          signed_by: string | null;
          version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          project_id?: string | null;
          client_id?: string | null;
          doc_type?: string;
          name: string;
          file_url?: string | null;
          signed?: boolean;
          signed_at?: string | null;
          signed_by?: string | null;
          version?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
      };
      permits: {
        Row: {
          id: string;
          project_id: string;
          permit_type: string;
          status: string;
          applied_date: string | null;
          approved_date: string | null;
          inspection_date: string | null;
          inspection_result: string | null;
          permit_number: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          permit_type: string;
          status?: string;
          applied_date?: string | null;
          approved_date?: string | null;
          inspection_date?: string | null;
          inspection_result?: string | null;
          permit_number?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['permits']['Insert']>;
      };
      activity_log: {
        Row: {
          id: string;
          company_id: string;
          user_id: string | null;
          entity_type: string;
          entity_id: string | null;
          action: string;
          detail: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id?: string | null;
          entity_type: string;
          entity_id?: string | null;
          action: string;
          detail?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['activity_log']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}