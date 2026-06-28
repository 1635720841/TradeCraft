export interface SetupChecklistItem {
  id: string;
  label: string;
  done: boolean;
  actionLabel?: string;
  onAction?: () => void;
}
