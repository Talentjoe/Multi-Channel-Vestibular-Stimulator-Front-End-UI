/** Shared graph/block data model. Saved graph compatibility depends on these shapes. */
import type { SignalType } from './signals';

export type Category =
  | 'Wave Generators'
  | 'Arithmetic'
  | 'Stimulation'
  | 'Sources'
  | 'Signal Processing'
  | 'Biomechanics'
  | 'Control'
  | 'Indicators'
  | 'Recording'
  | 'User Plugins';
export type RuntimeType = 'mock' | 'builtin' | 'rosbridge' | 'ros-later' | 'plugin-later';
export type BlockStatus = 'idle' | 'running' | 'warning' | 'error';
export type PortDirection = 'in' | 'out';

export interface PortDefinition {
  id: string;
  name: string;
  dir: PortDirection;
  signalType: SignalType;
  required?: boolean;
}

export type ParamType = 'number' | 'enum' | 'bool' | 'text';
export type ParamValue = number | string | boolean;

export interface ParamSpec {
  externallySettable?: boolean;
  key: string;
  label: string;
  type: ParamType;
  default: ParamValue;
  unit?: string;
  options?: Array<string | number>;
  min?: number;
  max?: number;
  step?: number;
}

export interface BlockDefinition {
  type: string;
  name: string;
  category: Category;
  runtime: RuntimeType;
  safeForMotorControl: boolean;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  params: ParamSpec[];
  description?: string;
  bodyKind?: 'gauge' | 'chart' | 'angle' | 'motor' | 'value';
}

export interface BlockInstance {
  collapsed?: boolean;
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  params: Record<string, ParamValue>;
  status: BlockStatus;
}

export interface EdgeDefinition {
  id: string;
  sourceBlockId: string;
  sourcePortId: string;
  targetBlockId: string;
  targetPortId: string;
  signalType: SignalType;
}

export interface GraphDocument {
  displayRefreshHz?: number;
  version: number;
  graphId?: string;
  settings?: { frequency: number; limit: number };
  viewport?: { x: number; y: number; zoom: number };
  nodes: BlockInstance[];
  edges: EdgeDefinition[];
}
