import {useGraphStore} from '../../state/graphStore';
import {useStudio} from '../../state/studioStore';
import type {BlockInstance} from '../../types/blocks';
export function DynamicInputControl({node}:{node:BlockInstance}){
 const value=useStudio(s=>s.dynamicValues[`${node.id}:out`]??Number(node.params.value??0.5));
 const min=Number(node.params.min??0),max=Number(node.params.max??1),step=Number(node.params.step??0.01);
 const set=(next:number)=>{if(Number.isFinite(next)&&next>=min&&next<=max)useStudio.setState(s=>({dynamicValues:{...s.dynamicValues,[`${node.id}:out`]:next}}));};
 return <div className="dynamic-input-control" onMouseDown={e=>e.stopPropagation()}>
   <label>Live value — {node.name}<input aria-label={`Live value ${node.id}`} type="range" min={min} max={max} step={step} value={value} onChange={e=>set(Number(e.target.value))}/></label>
   <div className="dynamic-value-row"><span>{min}</span><output aria-label={`Current value ${node.id}`}>{value.toFixed(3)}</output><span>{max}</span></div>
 </div>;
}
export function DynamicInputs(){const nodes=useGraphStore(s=>s.nodes);return <>{nodes.filter(n=>n.type==='dynamic_input').map(node=><DynamicInputControl key={node.id} node={node}/>)}</>;}
export function DisplayRefreshControl(){const hz=useStudio(s=>s.displayRefreshHz);return <label className="display-refresh">Display refresh (Hz)<input aria-label="Display refresh (Hz)" type="number" min={1} max={60} step={1} value={hz} onChange={e=>{const value=Number(e.target.value);if(Number.isInteger(value)&&value>=1&&value<=60)useStudio.setState({displayRefreshHz:value});}}/></label>;}
