import { create } from 'zustand';
export interface NodeGeometry {
  height: number;
  inputs: Record<string,{x:number;y:number}>;
  outputs: Record<string,{x:number;y:number}>;
}
/** Measured in world coordinates, shared by terminals, wires and fit-to-view. */
export const usePortGeometry = create<{nodes: Record<string,NodeGeometry>}>(()=>({nodes:{}}));
