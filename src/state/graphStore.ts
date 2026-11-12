import { useStudio } from './studioStore';
import { nodeDef } from '../graph/blockDefinitions';
import { check } from '../graph/stimulation';
import { create } from 'zustand';
import type { BlockInstance, BlockStatus, EdgeDefinition, ParamValue } from '../types/blocks';
import type { SignalType } from '../types/signals';
import { BLOCK_DEFS } from '../graph/blockDefinitions';
import { getCustomDef, defaultParamsFromDef } from './blockRegistryStore';
import { deserializeGraph, serializeGraph } from '../graph/GraphModel';
import { validateGraph, type ValidationIssue } from '../graph/validation';
export interface PendingWire {
    blockId: string;
    portId: string;
    signalType: SignalType;
    /** Canvas-relative position of the source output port dot. */
    x: number;
    y: number;
}
// Canvas geometry and persistence keys. Change these only with corresponding
// GraphCanvas behavior and migration/compatibility considerations in mind.
const NODE_WIDTH = 220;
const WORKSPACE_MAX = 10000;
const GRAPH_ID_KEY = 'rehab-robotics:graphId';
function createGraphId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `graph-${Date.now()}`;
}
function initialGraphId(): string {
    try {
        const saved = localStorage.getItem(GRAPH_ID_KEY);
        if (saved)
            return saved;
        const created = createGraphId();
        localStorage.setItem(GRAPH_ID_KEY, created);
        return created;
    }
    catch {
        return createGraphId();
    }
}
/** Build a node instance with default params from its definition. */
function makeNode(id: string, type: string, x: number, y: number): BlockInstance {
    const def = BLOCK_DEFS[type] ?? getCustomDef(type);
    return {
        id,
        type,
        name: def?.name ?? type,
        position: { x, y },
        params: def ? defaultParamsFromDef(def) : {},
        status: 'idle',
    };
}
function edge(id: string, s: string, sp: string, t: string, tp: string, signalType: EdgeDefinition['signalType']): EdgeDefinition {
    return { id, sourceBlockId: s, sourcePortId: sp, targetBlockId: t, targetPortId: tp, signalType };
}
/* ----- Default starter graph and saved-document compatibility ----- */
const DEFAULT_NODES: BlockInstance[] = [
  {...makeNode('B2','dynamic_input',20,20),name:'Live Amplitude',params:{value:0.5,min:0,max:1,step:0.01}},
  ...(['sine','square','triangle','sawtooth'] as const).flatMap((kind,index):BlockInstance[]=>{
    const base=3+index*3,x=260+(index%2)*560,y=20+Math.floor(index/2)*480;
    return [
      {...makeNode(`B${base}`,`wave_${kind}`,x,y),params:{...defaultParamsFromDef(BLOCK_DEFS[`wave_${kind}`]),amplitude:0.5}},
      {...makeNode(`B${base+1}`,'stimulate_output',x+280,y),name:`Channel ${index*2+1}`,params:{channel:index*2+1}},
      {...makeNode(`B${base+2}`,'stimulate_output',x+280,y+190),name:`Channel ${index*2+2}`,params:{channel:index*2+2}}
    ];
  })
];
const DEFAULT_EDGES: EdgeDefinition[] = Array.from({length:4},(_,index)=>{
  const base=3+index*3;
  return [edge(`e${index*3+1}`,'B2','out',`B${base}`,'param:amplitude','number'),
    edge(`e${index*3+2}`,`B${base}`,'positive',`B${base+1}`,'in','number'),
    edge(`e${index*3+3}`,`B${base}`,'negative',`B${base+2}`,'in','number')];
}).flat();
/** Read-only default graph document for product-path contract tests. */
export function getDefaultGraphDocument(): {
    nodes: BlockInstance[];
    edges: EdgeDefinition[];
} {
    return {
        nodes: DEFAULT_NODES.map((node) => ({
            ...node,
            position: { ...node.position },
            params: { ...node.params },
        })),
        edges: DEFAULT_EDGES.map((e) => ({ ...e })),
    };
}
interface GraphStore {
    graphId: string;
    nodes: BlockInstance[];
    edges: EdgeDefinition[];
    selectedId: string | null;
    selectedIds: string[];
    selectedEdgeId: string | null;
    pendingWire: PendingWire | null;
    validationIssues: ValidationIssue[];
    nextId: number;
    nextEdgeId: number;
    select(id: string | null): void;
    selectEdge(id: string | null): void;
    selectAll(): void;
    renameNode(nodeId: string, name: string): void;
    duplicateNode(nodeId: string): void;
    updateParam(nodeId: string, key: string, value: ParamValue): void;
    moveNode(nodeId: string, x: number, y: number): void;
    addNode(type: string, x: number, y: number): void;
    removeNode(nodeId: string): void;
    removeNodes(ids: string[]): void;
    removeEdge(edgeId: string): void;
    addEdge(sourceBlockId: string, sourcePortId: string, targetBlockId: string, targetPortId: string, signalType: SignalType): void;
    startWire(blockId: string, portId: string, signalType: SignalType, x: number, y: number): void;
    finishWire(targetBlockId: string, targetPortId: string): void;
    cancelWire(): void;
    setAllNodeStatuses(status: BlockStatus): void;
    validate(): ValidationIssue[];
    serialize(): string;
    load(json: string): void;
}
export const useGraphStore = create<GraphStore>((set, get) => ({
    graphId: initialGraphId(),
    nodes: DEFAULT_NODES,
    edges: DEFAULT_EDGES,
    selectedId: 'B3',
    selectedIds: ['B3'],
    selectedEdgeId: null,
    pendingWire: null,
    validationIssues: [],
    nextId: 15,
    nextEdgeId: 13,
    select: (id) => set({ selectedId: id, selectedIds: id ? [id] : [], selectedEdgeId: null }),
    selectEdge: (id) => set({ selectedEdgeId: id, selectedId: null, selectedIds: [] }),
    selectAll: () => set((s) => {
        const ids = s.nodes.map((n) => n.id);
        const primary = s.selectedId && ids.includes(s.selectedId) ? s.selectedId : ids[0] ?? null;
        return { selectedIds: ids, selectedId: primary, selectedEdgeId: null };
    }),
    renameNode: (nodeId, name) => set((s) => ({
        nodes: s.nodes.map((nd) => (nd.id === nodeId ? { ...nd, name } : nd)),
    })),
    duplicateNode: (nodeId) => set((s) => {
        const src = s.nodes.find((nd) => nd.id === nodeId);
        if (!src || useStudio.getState().locked)
            return s;
        if (src.type === 'stimulate_output') {
            useStudio.setState({ message: 'Stimulation channels cannot be duplicated; add a new output to allocate a free channel' });
            return s;
        }
        const id = `B${s.nextId}`;
        const copy: BlockInstance = {
            id,
            type: src.type,
            name: `${src.name} copy`,
            position: {
                x: src.position.x + 40,
                y: src.position.y + 40,
            },
            params: { ...src.params },
            status: 'idle',
        };
        return {
            nodes: [...s.nodes, copy],
            nextId: s.nextId + 1,
            selectedId: id,
            selectedIds: [id],
            selectedEdgeId: null,
        };
    }),
    updateParam: (nodeId, key, value) => set((s) => ({
        nodes: s.nodes.map((nd) => nd.id === nodeId ? { ...nd, params: { ...nd.params, [key]: value } } : nd),
    })),
    moveNode: (nodeId, x, y) => set((s) => ({
        nodes: s.nodes.map((nd) => (nd.id === nodeId ? { ...nd, position: { x, y } } : nd)),
    })),
    addNode: (type, x, y) => set((s) => {
        if (useStudio.getState().locked || !BLOCK_DEFS[type])
            return s;
        if (type === 'stimulate_output' && s.nodes.filter(n => n.type === type).length >= useStudio.getState().maxChannels)
            return s;
        const id = `B${s.nextId}`;
        const added = makeNode(id, type, x, y);
        if (type === 'stimulate_output')
            added.params.channel = Array.from({ length: useStudio.getState().maxChannels }, (_, i) => i + 1).find(ch => !s.nodes.some(n => n.type === type && Number(n.params.channel) === ch))!;
        return {
            nodes: [...s.nodes, added],
            nextId: s.nextId + 1,
            selectedId: id,
            selectedIds: [id],
            selectedEdgeId: null,
        };
    }),
    removeNode: (nodeId) => set((s) => {
        const selectedIds = s.selectedIds.filter((id) => id !== nodeId);
        return {
            nodes: s.nodes.filter((nd) => nd.id !== nodeId),
            edges: s.edges.filter((e) => e.sourceBlockId !== nodeId && e.targetBlockId !== nodeId),
            selectedId: s.selectedId === nodeId ? null : s.selectedId,
            selectedIds,
        };
    }),
    removeNodes: (ids) => set((s) => {
        if (ids.length === 0)
            return s;
        const idSet = new Set(ids);
        return {
            nodes: s.nodes.filter((nd) => !idSet.has(nd.id)),
            edges: s.edges.filter((e) => !idSet.has(e.sourceBlockId) && !idSet.has(e.targetBlockId)),
            selectedId: null,
            selectedIds: [],
            selectedEdgeId: null,
        };
    }),
    removeEdge: (edgeId) => set((s) => ({
        edges: s.edges.filter((e) => e.id !== edgeId),
        selectedEdgeId: s.selectedEdgeId === edgeId ? null : s.selectedEdgeId,
    })),
    addEdge: (sourceBlockId, sourcePortId, targetBlockId, targetPortId, signalType) => set((s) => {
        // Prevent duplicate connections to the same target port
        const alreadyConnected = s.edges.some((e) => e.targetBlockId === targetBlockId && e.targetPortId === targetPortId);
        if (alreadyConnected)
            return s;
        const id = `e${s.nextEdgeId}`;
        const newEdge: EdgeDefinition = { id, sourceBlockId, sourcePortId, targetBlockId, targetPortId, signalType };
        return { edges: [...s.edges, newEdge], nextEdgeId: s.nextEdgeId + 1 };
    }),
    startWire: (blockId, portId, signalType, x, y) => set({
        pendingWire: { blockId, portId, signalType, x, y },
        selectedId: null,
        selectedIds: [],
        selectedEdgeId: null,
    }),
    finishWire: (targetBlockId, targetPortId) => {
        const { pendingWire } = get();
        if (!pendingWire)
            return;
        if (pendingWire.blockId !== targetBlockId) {
            get().addEdge(pendingWire.blockId, pendingWire.portId, targetBlockId, targetPortId, pendingWire.signalType);
        }
        set({ pendingWire: null });
    },
    cancelWire: () => set({ pendingWire: null }),
    setAllNodeStatuses: (status) => set((s) => {
        if (s.nodes.length === 0)
            return s;
        return { nodes: s.nodes.map((n) => ({ ...n, status })) };
    }),
    validate: () => {
        const { nodes, edges } = get();
        const issues = validateGraph(nodes, edges);
        set({ validationIssues: issues });
        return issues;
    },
    serialize: () => JSON.stringify({ version: 2, graphId: get().graphId, nodes: get().nodes, edges: get().edges, settings: useStudio.getState().settings, displayRefreshHz:useStudio.getState().displayRefreshHz, viewport: useStudio.getState().viewport }),
    load: (json) => {
        if (useStudio.getState().locked)
            throw Error('Stop execution before loading');
        const doc = deserializeGraph(json);
        if (![1, 2].includes(doc.version))
            throw Error('Unsupported project version');
        if (doc.nodes.some(n => !n || typeof n.id !== 'string' || typeof n.type !== 'string' || !n.params || typeof n.params !== 'object' || !n.position || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y)))
            throw Error('Invalid node data');
        if (new Set(doc.nodes.map(n => n.id)).size !== doc.nodes.length)
            throw Error('Duplicate node IDs');
        if (doc.viewport && (!Number.isFinite(doc.viewport.x) || !Number.isFinite(doc.viewport.y) || !Number.isFinite(doc.viewport.zoom) || doc.viewport.zoom < .1 || doc.viewport.zoom > 3))
            throw Error('Invalid viewport');
        if(doc.displayRefreshHz!==undefined&&(!Number.isInteger(doc.displayRefreshHz)||doc.displayRefreshHz<1||doc.displayRefreshHz>60))throw Error('Display refresh must be 1?60 Hz');
    const before = doc.nodes.length;
        doc.nodes = doc.nodes.filter(n => BLOCK_DEFS[n.type]).map(n => ({ ...makeNode(n.id, n.type, n.position.x, n.position.y), ...n, status: 'idle' }));
        doc.edges = doc.edges.filter(e => doc.nodes.some(n => n.id === e.sourceBlockId) && doc.nodes.some(n => n.id === e.targetBlockId));
        const settings = doc.settings ?? useStudio.getState().settings;
        const chans = doc.nodes.filter(n => n.type === 'stimulate_output').map(n => Number(n.params.channel));
        if (new Set(chans).size !== chans.length || chans.some(ch => !Number.isInteger(ch) || ch < 1 || ch > useStudio.getState().maxChannels))
            throw Error('Invalid or duplicate channel');
        if (!Number.isInteger(settings.frequency) || settings.frequency < 1 || settings.frequency > 100000 || !Number.isFinite(settings.limit) || settings.limit <= 0)
            throw Error('Invalid project settings');
        useStudio.setState({ settings,displayRefreshHz:doc.displayRefreshHz??30,dynamicValues:{}, viewport: doc.viewport ?? { x: 0, y: 0, zoom: 1 }, message: before !== doc.nodes.length ? `Migrated: removed ${before - doc.nodes.length} obsolete blocks` : 'Project loaded' });
        const firstId = doc.nodes[0]?.id ?? null;
        const graphId = doc.graphId || createGraphId();
        try {
            localStorage.setItem(GRAPH_ID_KEY, graphId);
        }
        catch { /* storage is optional */ }
        set({
            graphId,
            nextId: Math.max(1, ...doc.nodes.map(n => Number(n.id.replace(/\D/g, '')) || 0)) + 1,
            nextEdgeId: Math.max(1, ...doc.edges.map(e => Number(e.id.replace(/\D/g, '')) || 0)) + 1,
            nodes: doc.nodes,
            edges: doc.edges,
            selectedId: firstId,
            selectedIds: firstId ? [firstId] : [],
            selectedEdgeId: null,
            validationIssues: [],
        });
    },
}));
const mutableActions = ['renameNode', 'updateParam', 'moveNode', 'addNode', 'duplicateNode', 'removeNode', 'removeNodes', 'removeEdge', 'addEdge', 'startWire', 'finishWire'] as const;
for (const key of mutableActions) {
    const original = useGraphStore.getState()[key] as (...args: any[]) => any;
    useGraphStore.setState({ [key]: (...args: any[]) => {
            if (useStudio.getState().locked)
                return;
            if (key === 'updateParam' && args[1] === 'channel') {
                const ch = Number(args[2]);
                if (!Number.isInteger(ch) || ch < 1 || ch > useStudio.getState().maxChannels || useGraphStore.getState().nodes.some(n => n.id !== args[0] && n.type === 'stimulate_output' && Number(n.params.channel) === ch)) {
                    useStudio.setState({ message: 'Channel must be unique and within configured range' });
                    return;
                }
            }
            return original(...args);
        } });
}
