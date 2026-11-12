import { useStudio } from '../../state/studioStore';
import { MiniChart } from '../common/MiniChart';
import { LogsPanel } from './LogsPanel';
import {DynamicInputs,DisplayRefreshControl} from '../common/DynamicInputControl';
export function StimulationDashboard(){
 const s=useStudio();
 return <aside className="dashboard stimulation-dashboard"><div className="panel-heading">LIVE CHANNEL WAVEFORMS / SIMULATION</div>
 <div className="monitor-controls"><section className="dash-panel"><h3>{s.state.toUpperCase()} / t = {s.time.toFixed(3)} s</h3><p>{s.settings.frequency} samples/s / display {s.displayRefreshHz} Hz / limit +/-{s.settings.limit} / sum {s.channels.reduce((a,b)=>a+b,0).toPrecision(6)}</p><DisplayRefreshControl/><p role="status">{s.message}</p></section>
 <section className="dash-panel live-controls"><h3>Dynamic Inputs / adjustable while running</h3><DynamicInputs/></section></div>
 <div className="channel-grid">{s.channels.map((v,i)=><section className="dash-panel channel-chart" key={i}><h3>Channel {i+1}<output style={{float:'right'}}>{v.toFixed(6)}</output></h3><MiniChart data={s.history[i]??[]} color={i%2?'#7e9be0':'#2bb89a'} width={700} height={90} minValue={-s.settings.limit} maxValue={s.settings.limit} ariaLabel={`Channel ${i+1} live waveform`}/><div className="chart-scale"><span>-{s.settings.limit} ... +{s.settings.limit}</span><span>Last 2 s</span></div></section>)}</div><LogsPanel/>
 </aside>;
}
