import {useStudio} from '../../state/studioStore';
/** Inspector for the selected graph block; routes live ESP settings to the command facade. */
import { useEffect, useRef, useState } from 'react';
import { nodeDef } from '../../graph/blockDefinitions';
import { useGraphStore } from '../../state/graphStore';
import { signalColor } from '../../theme/tokens';
import { ParamField } from './ParamField';
import { setHardwareSampleRate } from '../../data/appDataSource';
import { useRuntimeStore } from '../../state/runtimeStore';
import { useSystemStore } from '../../state/systemStore';

export function PropertiesPanel() {
  const locked = useStudio(s=>s.locked);
  const allEdges = useGraphStore(s=>s.edges);
  const selectedId = useGraphStore((s) => s.selectedId);
  const node = useGraphStore((s) => s.nodes.find((item) => item.id === s.selectedId));
  const issues = useGraphStore((s) => s.validationIssues.filter((issue) => !selectedId || issue.blockId === selectedId));
  const updateParam = useGraphStore((s) => s.updateParam);
  const renameNode = useGraphStore((s) => s.renameNode);
  const setRuntimeSampleRate = useRuntimeStore((s) => s.setSampleRate);
  const def = node ? nodeDef(node) : undefined;
  const lastNonEmptyRef = useRef(node?.name ?? '');
  const [pendingSampleRate, setPendingSampleRate] = useState(false);

  useEffect(() => {
    if (node && node.name.trim() !== '') {
      lastNonEmptyRef.current = node.name;
    }
  }, [node?.id, node?.name]);

  const applyParameter = async (key: string, value: Parameters<typeof updateParam>[2]) => {
    if (node?.type !== 'esp32_imu' || key !== 'sampleRate') {
      updateParam(node!.id, key, value);
      return;
    }

    const rateHz = Number(value);
    if (!Number.isInteger(rateHz) || rateHz < 1 || rateHz > 1000) {
      useSystemStore.getState().addLog('ERROR', 'ESP32 pair rate must be an integer between 1 and 1000 Hz');
      return;
    }

    setPendingSampleRate(true);
    const result = await setHardwareSampleRate(rateHz);
    setPendingSampleRate(false);
    if (result.success) {
      // Keep graph and runtime state aligned only with an acknowledged device rate.
      updateParam(node.id, 'sampleRate', rateHz);
      updateParam(node.id, 'effectiveSampleRate', rateHz);
      setRuntimeSampleRate(rateHz);
    }
    useSystemStore.getState().addLog(result.success ? 'INFO' : 'ERROR', result.message);
  };

  return (
    <aside className="properties">
      <div className="panel-heading">PROPERTIES</div>
      {!node || !def ? (
        <div className="empty-panel">Select a block to inspect its parameters and terminal contract.</div>
      ) : (
        <div className="properties-scroll">
          <section className="prop-section">
            <label className="param-field" htmlFor="block-name-input">
              <span>Name</span>
              <input
                id="block-name-input" disabled={locked}
                type="text"
                value={node.name}
                onChange={(event) => {
                  const next = event.target.value;
                  renameNode(node.id, next);
                  if (next.trim() !== '') lastNonEmptyRef.current = next;
                }}
                onBlur={() => {
                  if (node.name.trim() === '') {
                    renameNode(node.id, lastNonEmptyRef.current);
                  }
                }}
              />
            </label>
            <div className="kv-grid">
              <span>ID</span>
              <strong>{node.id}</strong>
              <span>Type</span>
              <strong>{node.type}</strong>
              <span>Runtime</span>
              <strong>{def.runtime}</strong>
              <span>Status</span>
              <strong>{node.status}</strong>
              <span>Motor Safe</span>
              <strong>{def.safeForMotorControl ? 'Yes' : 'No'}</strong>
            </div>
          </section>

          <section className="prop-section">
            <h3>Inputs</h3>
            {!def.inputs.some(p=>!p.id.startsWith('param:')) ? <div className="muted">No inputs</div> : def.inputs.filter(p=>!p.id.startsWith('param:')).map((port) => (
              <div key={port.id} className="port-row">
                <span>{port.name}</span>
                <em style={{ color: signalColor[port.signalType] }}>{port.signalType}</em>
                {port.required !== false && <b>req</b>}
              </div>
            ))}
          </section>

          {def.inputs.some(p=>p.id.startsWith('param:'))&&<section className="prop-section">
            <h3>Parameter Inputs</h3>
            {def.inputs.filter(p=>p.id.startsWith('param:')).map(port=><div className="port-row" key={port.id}><span style={{color:'#c9a23a'}}>? {port.name}</span><em>{allEdges.some(e=>e.targetBlockId===node.id&&e.targetPortId===port.id)?'connected':'optional'}</em></div>)}
          </section>}

          <section className="prop-section">
            <h3>Outputs</h3>
            {def.outputs.length === 0 ? <div className="muted">No outputs</div> : def.outputs.map((port) => (
              <div key={port.id} className="port-row">
                <span>{port.name}</span>
                <em style={{ color: signalColor[port.signalType] }}>{port.signalType}</em>
              </div>
            ))}
          </section>

          <section className="prop-section">
            <h3>Parameters</h3>
            {node.type.startsWith('wave_') && node.type !== 'wave_constant' && <label className="param-field">Period (s)<input type="number" disabled={locked || allEdges.some(e=>e.targetBlockId===node.id&&e.targetPortId==='param:frequency')} value={1/Number(node.params.frequency)} min={0.000001} step="any" onChange={e=>{if(Number(e.target.value)>0)updateParam(node.id,'frequency',1/Number(e.target.value));}} /></label>}
            {node.type === 'wave_csv' && <label className="param-field">Import CSV<input type="file" accept=".csv,text/csv" disabled={locked} onChange={async e=>{const f=e.target.files?.[0];if(f)updateParam(node.id,'csv',await f.text());}} /></label>}
            {def.params.length === 0 ? <div className="muted">No editable parameters</div> : def.params.map((param) => (
              <ParamField
                key={param.key}
                spec={{...param,label:param.label+(allEdges.some(e=>e.targetBlockId===node.id&&e.targetPortId===`param:${param.key}`)?' [connected]':'')}}
                value={node.params[param.key] ?? param.default}
                disabled={locked || pendingSampleRate || allEdges.some(e=>e.targetBlockId===node.id&&e.targetPortId===`param:${param.key}`)}
                onChange={(value) => void applyParameter(param.key, value)}
                onCommit={node.type === 'esp32_imu' && param.key === 'sampleRate'
                  ? (value) => void applyParameter(param.key, value)
                  : undefined}
              />
            ))}
          </section>

          <section className="prop-section">
            <h3>Validation</h3>
            {issues.length === 0 ? (
              <div className="validation-ok">No validation issues for this selection.</div>
            ) : (
              issues.map((issue, index) => (
                <div key={`${issue.message}-${index}`} className={`validation-msg level-${issue.level.toLowerCase()}`}>
                  <strong>{issue.level}</strong>
                  <span>{issue.message}</span>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
