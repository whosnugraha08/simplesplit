export interface User {
  id: string;
  username: string;
  pin_hash: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface Friend {
  id: string;
  name: string;
  is_admin: boolean;
  user_id?: string | null;
  email?: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_number?: string | null;
  // Joined
  payment_methods?: PaymentMethod[];
}

export interface PaymentMethod {
  id: string;
  friend_id: string;
  label: string;
  bank_name: string;
  account_number: string | null;
  qris_image_url: string | null;
  created_at: string;
}

export interface Bill {
  id: string;
  title: string;
  description: string | null;
  paid_by: string;
  created_by?: string | null;
  receipt_image_url: string | null;
  subtotal: number;
  tax_amount: number;
  service_charge_amount: number;
  total_amount: number;
  status: 'draft' | 'assigned' | 'settled';
  bill_date: string;
  created_at: string;
  updated_at: string;
  // Joined
  paid_by_friend?: Friend;
}

export interface BillItem {
  id: string;
  bill_id: string;
  item_name: string;
  item_price: number;
  quantity: number;
  created_at: string;
}

export interface ItemAssignment {
  id: string;
  bill_item_id: string;
  friend_id: string;
  share_amount: number;
  assigned_qty: number;
  // Joined
  friend?: Friend;
  bill_item?: BillItem;
}

export interface Debt {
  id: string;
  bill_id: string;
  debtor_id: string;
  creditor_id: string;
  amount: number;
  status: 'unpaid' | 'paid';
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  // Joined
  debtor?: Friend;
  creditor?: Friend;
  bill?: Bill;
}

// OCR Result types
export interface ParsedReceiptItem {
  name: string;
  price: number;
  quantity: number;
}

export interface ParsedReceipt {
  items: ParsedReceiptItem[];
  subtotal: number | null;
  tax: number | null;
  service_charge: number | null;
  total: number | null;
  raw_text: string;
}

// Assignment UI types — now with per-person qty
export interface AssignmentEntry {
  friendId: string;
  qty: number;
}

export interface ItemWithAssignees extends BillItem {
  assignee_ids: string[];
  // v2: per-person qty assignments
  assignments: AssignmentEntry[];
}

export interface PersonBreakdown {
  friend: Friend;
  items_subtotal: number;
  tax_share: number;
  service_share: number;
  total: number;
  // v2: per-item detail
  item_details: { itemName: string; qty: number; amount: number }[];
}
