export interface Friend {
  id: string;
  name: string;
  bank_name: string | null;
  bank_account_number: string | null;
  qris_image_url: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Bill {
  id: string;
  title: string;
  description: string | null;
  paid_by: string;
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

// Assignment UI types
export interface ItemWithAssignees extends BillItem {
  assignee_ids: string[];
}

export interface PersonBreakdown {
  friend: Friend;
  items_subtotal: number;
  tax_share: number;
  service_share: number;
  total: number;
}
