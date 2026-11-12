import {usePortGeometry} from './portGeometry';
import { ContextMenu } from '../common/ContextMenu';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { nodeDef } from '../../graph/blockDefinitions';
import { useGraphStore } from '../../state/graphStore';
import { useStudio } from '../../state/studioStore';
import { useKeyboardDelete } from '../../hooks/useKeyboardDelete';
import { BlockNode } from './BlockNode';
import { Wire, PendingWireOverlay, NODE_WIDTH, portTop } from './Wire';
import { BLOCK_TYPE_MIME } from '../library/LibraryItem';
export function GraphCanvas() {
    const s = useGraphStore(), v = useStudio(x => x.viewport), ref = useRef<HTMLDivElement>(null), space = useRef(false);
    const [menu, setMenu] = useState<null | {
        x: number;
        y: number;
        id?: string;
        wire?: string;
    }>(null);
    const [pointer, setPointer] = useState({ x: 0, y: 0 }), [box, setBox] = useState<null | {
        x: number;
        y: number;
        w: number;
        h: number;
    }>(null);
    const view = (next: typeof v) => useStudio.setState({ viewport: next });
    const point = (x: number, y: number) => { const r = ref.current!.getBoundingClientRect(); return { x: (x - r.left - v.x) / v.zoom, y: (y - r.top - v.y) / v.zoom }; };
    useKeyboardDelete();
    useEffect(() => { const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        space.current = true;
        e.preventDefault();
    } if (e.key === 'Escape')
        s.cancelWire(); if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        s.selectAll();
    } }; const up = () => space.current = false; window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', up); return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', up); }; }, []);
    useEffect(() => { const el = ref.current!; const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(), old = useStudio.getState().viewport;
        const unit=e.deltaMode===1?16:e.deltaMode===2?el.clientWidth:1;
        if(!e.ctrlKey && (e.deltaX!==0 || e.shiftKey)) {view({...old,x:old.x-(e.deltaX||e.deltaY)*unit,y:old.y-(e.deltaX?e.deltaY:0)*unit});return;}
        const z = Math.max(.1, Math.min(3, old.zoom * Math.exp(-e.deltaY * .001))); const x = e.clientX - r.left, y = e.clientY - r.top; view({ x: x - (x - old.x) * z / old.zoom, y: y - (y - old.y) * z / old.zoom, zoom: z }); }; el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel); }, []);
    const background = (e: MouseEvent) => {
        if (e.button !== 0 && e.button !== 1)
            return;
        const pan = e.button === 1 || space.current;
        if (!pan && (e.target as HTMLElement).closest('.block-node,.wire'))
            return;
        e.preventDefault();
        e.stopPropagation();
        const start = point(e.clientX, e.clientY), sx = e.clientX, sy = e.clientY, old = { ...v }, selected = e.shiftKey ? s.selectedIds : [];
        const move = (m: globalThis.MouseEvent) => { if (pan) {
            view({ ...old, x: old.x + m.clientX - sx, y: old.y + m.clientY - sy });
            return;
        } const p = point(m.clientX, m.clientY); setBox({ x: Math.min(p.x, start.x), y: Math.min(p.y, start.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }); const ids = s.nodes.filter(n => n.position.x + 220 >= Math.min(p.x, start.x) && n.position.x <= Math.max(p.x, start.x) && (n.position.y + (usePortGeometry.getState().nodes[n.id]?.height??150)) >= Math.min(p.y, start.y) && n.position.y <= Math.max(p.y, start.y)).map(n => n.id); useGraphStore.setState({ selectedIds: [...new Set([...selected, ...ids])], selectedId: ids[0] ?? null }); };
        if (!pan && !e.shiftKey)
            s.select(null);
        const up = () => { setBox(null); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    };
    const center = () => { if (!s.nodes.length) {
        view({ x: 0, y: 0, zoom: 1 });
        return;
    } const r = ref.current!.getBoundingClientRect(); const minX = Math.min(...s.nodes.map(n => n.position.x)), minY = Math.min(...s.nodes.map(n => n.position.y)), maxX = Math.max(...s.nodes.map(n => n.position.x + 220)), maxY = Math.max(...s.nodes.map(n => n.position.y + (usePortGeometry.getState().nodes[n.id]?.height??400))); const zoom = Math.min(1, (r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY)); view({ zoom, x: r.width / 2 - (minX + maxX) / 2 * zoom, y: r.height / 2 - (minY + maxY) / 2 * zoom }); };
    return <section className="canvas-panel"><div className="panel-heading">BLOCK DIAGRAM <div className="zoom-controls"><button onClick={() => view({ ...v, zoom: Math.max(.1, v.zoom - .1) })}>-</button><button onClick={() => view({ ...v, zoom: 1 })}>{Math.round(v.zoom * 100)}%</button><button onClick={() => view({ ...v, zoom: Math.min(3, v.zoom + .1) })}>+</button><button onClick={center}>Center</button></div></div>
 <div className="graph-canvas infinite" ref={ref} style={{ backgroundPosition: `${v.x}px ${v.y}px`, backgroundSize: `${16 * v.zoom}px ${16 * v.zoom}px` }} onMouseDownCapture={e => { if (space.current || e.button === 1)
        background(e); }} onMouseDown={e => { if (!space.current && e.button === 0)
        background(e); }} onMouseMove={e => setPointer(point(e.clientX, e.clientY))} onMouseUp={() => s.cancelWire()} onContextMenu={e => { e.preventDefault(); const el = (e.target as HTMLElement).closest('[data-node-id]'); const id = el?.getAttribute('data-node-id') ?? undefined; if (id && !s.selectedIds.includes(id))
        s.select(id); setMenu({ x: e.clientX, y: e.clientY, id }); }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const p = point(e.clientX, e.clientY); s.addNode(e.dataTransfer.getData(BLOCK_TYPE_MIME), p.x, p.y); }}>
 <div style={{ position: 'absolute', transform: `translate(${v.x}px,${v.y}px) scale(${v.zoom})`, transformOrigin: '0 0', width: 0, height: 0 }}>
 <svg className="wire-layer" style={{ width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}>
 {s.edges.map(e => { const a = s.nodes.find(n => n.id === e.sourceBlockId), b = s.nodes.find(n => n.id === e.targetBlockId); if (!a || !b)
        return null; const ad = nodeDef(a)!, bd = nodeDef(b)!, ai = ad.outputs.findIndex(p => p.id === e.sourcePortId), bi = bd.inputs.findIndex(p => p.id === e.targetPortId); if (ai < 0 || bi < 0)
        return null; return <Wire key={e.id} edge={e} source={a} target={b} sourcePort={ad.outputs[ai]} targetPort={bd.inputs[bi]} sourcePortIndex={ai} targetPortIndex={bi} selected={s.selectedEdgeId === e.id} onClick={s.selectEdge} onContextMenu={(id, e) => setMenu({ x: e.clientX, y: e.clientY, wire: id })}/>; })}
 {s.pendingWire && <PendingWireOverlay sx={s.pendingWire.x} sy={s.pendingWire.y} tx={pointer.x} ty={pointer.y} color="#6f9bd6"/>}</svg>
 {s.nodes.map(n => <BlockNode key={n.id} node={n} zoom={v.zoom} selected={s.selectedIds.includes(n.id)} onSelect={s.select} onMove={s.moveNode} onWireStart={(node, p, i, e) => { e.preventDefault(); const anchor=usePortGeometry.getState().nodes[node.id]?.outputs[p.id];s.startWire(node.id,p.id,p.signalType,node.position.x+(anchor?.x??NODE_WIDTH),node.position.y+(anchor?.y??portTop(i))); }} onWireFinish={(node, p) => { if (s.pendingWire?.signalType === p.signalType)
        s.finishWire(node.id, p.id); }} onContextMenu={(id) => { if (!s.selectedIds.includes(id))
        s.select(id); }}/>)}
 {box && <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, border: '1px solid #4a90d6', background: '#4a90d622', pointerEvents: 'none' }}/>}
 </div></div>{menu && <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={menu.wire ? [{ id: 'delete', label: 'Delete wire', danger: true, onSelect: () => s.removeEdge(menu.wire!) }] : menu.id ? [{ id: 'duplicate', label: 'Duplicate', onSelect: () => s.duplicateNode(menu.id!) }, { id: 'delete', label: 'Delete selected blocks', danger: true, onSelect: () => s.removeNodes(useGraphStore.getState().selectedIds) }] : [{ id: 'all', label: 'Select All', onSelect: s.selectAll }, { id: 'center', label: 'Center', onSelect: center }]}/>}<div className="canvas-hint">Drag to select / Shift add / Middle / Space + drag to pan / Tilt wheel or Shift + wheel to move sideways / Wheel zoom / Delete selection</div></section>;
}
