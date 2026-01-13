export enum EntityType {
  PersName = 'persName',
  PlaceName = 'placeName',
  Name = 'name'
}

export interface SelectionState {
  text: string;
  path: string; // "0:1:3" format
  startOffset: number;
  endOffset: number;
  rect: DOMRect | null;
  isInsideEntity?: boolean;
}

export interface XmlNodeProps {
  node: Node;
  path: string;
  onAction: (action: string, path: string, payload?: any) => void;
  editingPath?: string | null;
}