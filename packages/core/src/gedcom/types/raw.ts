export interface GedcomLine {
  level: number;
  xref?: string;
  tag: string;
  value: string;
}

export interface GedcomNode {
  level: number;
  tag: string;
  xref?: string;
  value: string;
  children: GedcomNode[];
}
