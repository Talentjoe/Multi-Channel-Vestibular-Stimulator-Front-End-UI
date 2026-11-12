import {DisplayRefreshControl} from '../common/DynamicInputControl';
import { useEffect, useRef, useState } from 'react';
import { useStudio, loadConfiguration } from '../../state/studioStore';
import { useGraphStore } from '../../state/graphStore';
import { check, proveBalance } from '../../graph/stimulation';
import { actions } from '../../state/actions';
import { appDataSource } from '../../data/appDataSource';
import { SimulationTransport } from '../../data/StimulationTransport';
const transport = new SimulationTransport();
export function StudioToolbar() {
    const s = useStudio(), file = useRef<HTMLInputElement>(null), worker = useRef<Worker>(), exporter = useRef<Worker>(), index = useRef(0), generation = useRef(0);
    const pending=useRef<number[][]>([]),lastPaint=useRef(0);
    useEffect(()=>{worker.current?.postMessage({mode:'inputs',values:s.dynamicValues});},[s.dynamicValues]);
    const [settings, setSettings] = useState(false), [confirmation, setConfirmation] = useState(false), [exporting, setExporting] = useState(false);
    const stop = async (state: 'idle' | 'paused' | 'fault' | 'estopped', message = '') => { if (state === 'paused') {
        worker.current?.postMessage({ mode: 'pause' });
    }
    else {
        generation.current++;
        worker.current?.terminate();
        worker.current = undefined;
    } appDataSource.stop(); await transport.zero(); await transport.stop(); useStudio.setState({ state, locked: state === 'paused', channels: Array(s.maxChannels).fill(0), message: message || state }); if (state !== 'paused')
        index.current = 0; };
    useEffect(() => { void loadConfiguration(); return () => { generation.current++; worker.current?.terminate(); exporter.current?.terminate(); void transport.zero(); void transport.stop(); }; }, []);
    const preflight = () => { try {
        const c = useGraphStore.getState();
        check(c, s.maxChannels, s.settings);
        proveBalance(c);
        setConfirmation(true);
    }
    catch (e) {
        useStudio.setState({ message: (e as Error).message });
    } };
    const run = async () => {
        setConfirmation(false);
        try {
            const c = useGraphStore.getState();
            check(c, s.maxChannels, s.settings);
            proveBalance(c);
            await transport.start(s.settings.frequency);
            if (s.state === 'paused' && worker.current) {
                useStudio.setState({ state: 'running', locked: true, message: 'Resumed ? simulation transport' });
                worker.current.postMessage({ mode: 'resume' });
                appDataSource.start(100);
                return;
            }
            pending.current=Array.from({length:s.maxChannels},()=>[]);lastPaint.current=0;
            useStudio.setState({history:Array.from({length:s.maxChannels},()=>[]),time:0});
            const id = ++generation.current;
            const w = new Worker(new URL('../../graph/stimulation.worker.ts', import.meta.url), { type: 'module' });
            worker.current = w;
            w.onmessage = e => { if (id !== generation.current || useStudio.getState().state !== 'running')
                return; if (e.data.error) {
                void stop('fault', e.data.error);
                return;
            } index.current = e.data.index; void transport.send({ time: e.data.time, channels: e.data.channels }).catch(err => void stop('fault', String(err))); e.data.traces.forEach((trace:number[],i:number)=>pending.current[i].push(...trace));
            const now=performance.now();if(now-lastPaint.current>=1000/useStudio.getState().displayRefreshHz){lastPaint.current=now;const traces=pending.current;pending.current=Array.from({length:s.maxChannels},()=>[]);useStudio.setState(current=>({channels:e.data.channels,time:e.data.time,history:current.history.map((h,i)=>[...h,...traces[i]].slice(-Math.min(2000,s.settings.frequency*2)))}));} };
            w.onerror = e => void stop('fault', e.message);
            useStudio.setState({ locked: true, state: 'running', message: 'Running — simulation transport' });
            appDataSource.start(100);
            w.postMessage({ mode: 'run', circuit: { nodes: c.nodes, edges: c.edges }, settings: s.settings, count: s.maxChannels,external:s.dynamicValues, startIndex: index.current });
        }
        catch (e) {
            void stop('fault', (e as Error).message);
        }
    };
    const exportCsv = () => { const c = useGraphStore.getState(); const w = new Worker(new URL('../../graph/stimulation.worker.ts', import.meta.url), { type: 'module' }); exporter.current = w; setExporting(true); w.onmessage = e => { w.terminate(); setExporting(false); if (e.data.error) {
        useStudio.setState({ message: e.data.error });
        return;
    } const url = URL.createObjectURL(new Blob([e.data.csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'stimulation-period.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); useStudio.setState({ message: `Exported ${e.data.rows} samples; period ${e.data.period}s; external sources = 0` }); }; w.onerror = e => { w.terminate(); setExporting(false); useStudio.setState({ message: e.message }); }; w.postMessage({ mode: 'export', circuit: { nodes: c.nodes, edges: c.edges }, settings: s.settings, count: s.maxChannels }); };
    return <><div className="toolbar"><div className="toolbar-brand"><span className="toolbar-logo"/>Rehab Robotics Studio</div>
 <button className="btn btn-run" disabled={!s.ready || ['running', 'fault', 'estopped'].includes(s.state)} onClick={preflight}>Run</button><button className="btn" disabled={s.state !== 'running'} onClick={() => void stop('paused')}>Pause</button><button className="btn" disabled={!['running', 'paused'].includes(s.state)} onClick={() => void stop('idle')}>Stop</button>
 <button className="btn" disabled={s.locked} onClick={() => { const issues = useGraphStore.getState().validate(); useStudio.setState({ message: issues.map(i => i.message).join('; ') || 'Structure and zero-sum proof passed' }); }}>Validate Graph</button>
 <button className="btn" disabled={s.locked || !s.ready} onClick={() => setSettings(true)}>Global Settings</button><button className="btn" disabled={!s.ready || exporting} onClick={exportCsv}>Export Period CSV</button>{exporting && <button className="btn" onClick={() => { exporter.current?.terminate(); setExporting(false); }}>Cancel Export</button>}
 <button className="btn" onClick={actions.saveProject}>Save</button><button className="btn" disabled={s.locked} onClick={() => file.current?.click()}>Load</button><input ref={file} type="file" hidden accept=".json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) {
        try {
            useGraphStore.getState().load(await f.text());
        }
        catch (err) {
            useStudio.setState({ message: (err as Error).message });
        }
    } e.target.value = ''; }}/>
 <span className="toolbar-spacer"/><span className="runtime-state-value">{s.state.toUpperCase()}</span><button className="btn btn-estop" onClick={() => ['fault', 'estopped'].includes(s.state) ? void stop('idle') : void stop('estopped')}>{['fault', 'estopped'].includes(s.state) ? 'RESET' : 'E-STOP'}</button></div>
 {settings && <div className="modal-backdrop"><section className="studio-modal"><h2>Global Settings</h2><DisplayRefreshControl/><p>Simulation transport · no physical units assigned</p><label className="param-field">Simulation frequency (Hz)<input type="number" min="1" max="100000" step="1" value={s.settings.frequency} onChange={e => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1 && v <= 100000)
        useStudio.setState({ settings: { ...s.settings, frequency: v } }); }}/></label><label className="param-field">Per-channel amplitude limit k<input type="number" min="0" step="any" value={s.settings.limit} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0)
        useStudio.setState({ settings: { ...s.settings, limit: v } }); }}/></label><p>Channels: 1–{s.maxChannels} (configuration file)</p><button className="btn" onClick={() => setSettings(false)}>Close</button></section></div>}
 {confirmation && <div className="modal-backdrop"><section className="studio-modal"><h2>Confirm Simulation</h2><p>Zero-sum identity proven. Each channel is checked against ±{s.settings.limit} at {s.settings.frequency} Hz.</p><p>Channels: {useGraphStore.getState().nodes.filter(n => n.type === 'stimulate_output').map(n => n.params.channel).join(', ') || 'none'}</p><p>No hardware transport is connected.</p><button className="btn btn-run" onClick={() => void run()}>Confirm Run</button><button className="btn" onClick={() => setConfirmation(false)}>Cancel</button></section></div>}</>;
}
