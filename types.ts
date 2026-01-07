
export enum AppStep {
  HISTORY = 'HISTORY',
  SCAN = 'SCAN',
  EDIT = 'EDIT',
  PEOPLE = 'PEOPLE',
  SPLIT = 'SPLIT',
  SUMMARY = 'SUMMARY'
}

export interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  assignedTo: string[]; // person IDs
}

export interface Person {
  id: string;
  name: string;
  color: string;
}

export interface Receipt {
  id: string;
  date: string;
  storeName: string;
  items: ReceiptItem[];
  totalOnTicket: number;
  currency: string;
}

export interface HistoryItem {
  id: string;
  date: string;
  storeName: string;
  total: number;
  participantsCount: number;
}
