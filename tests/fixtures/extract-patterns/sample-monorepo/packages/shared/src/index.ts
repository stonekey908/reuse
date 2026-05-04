// Shared types used by every workspace package. The pattern of interest here is
// not the types themselves but the convention: every cross-workspace contract
// goes through this package, so adding a new type means one PR touching one
// shared file rather than N copies in N apps.

export type Layer = 'ui' | 'api' | 'data' | 'utils' | 'external';

export interface GraphNode {
  id: string;
  name: string;
  layer: Layer;
  imports: string[];
  exports: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'static-import' | 'dynamic-import' | 're-export';
}
