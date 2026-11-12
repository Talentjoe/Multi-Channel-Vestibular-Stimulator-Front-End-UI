import type { BlockInstance, EdgeDefinition } from '../types/blocks';
import type { LogLevel } from '../types/system';
import { check, proveBalance } from './stimulation';
import { useStudio } from '../state/studioStore';
export interface ValidationIssue {
    level: LogLevel;
    blockId?: string;
    message: string;
}
export function validateGraph(nodes: BlockInstance[], edges: EdgeDefinition[]): ValidationIssue[] { try {
    const s = useStudio.getState();
    check({ nodes, edges }, s.maxChannels, s.settings);
    proveBalance({ nodes, edges });
    return [];
}
catch (e) {
    return [{ level: 'ERROR', message: (e as Error).message }];
} }
