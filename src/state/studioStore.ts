import { create } from 'zustand';
import type { Settings } from '../graph/stimulation';
export const useStudio = create<{
    settings: Settings;
    displayRefreshHz:number;
    dynamicValues:Record<string,number>;
    maxChannels: number;
    ready: boolean;
    locked: boolean;
    viewport: {
        x: number;
        y: number;
        zoom: number;
    };
    message: string;
    state: 'idle' | 'running' | 'paused' | 'estopped' | 'fault';
    channels: number[];
    time: number;
    history: number[][];
}>(() => ({ settings: { frequency: 1000, limit: 1 }, displayRefreshHz:30,dynamicValues:{}, maxChannels: 8, ready: false, locked: false, viewport: { x: 12, y: 12, zoom: 0.7 }, message: 'Simulation transport — no hardware output', state: 'idle', channels: Array(8).fill(0), time: 0, history: Array.from({ length: 8 }, () => []) }));
export async function loadConfiguration() {
    try {
        const r = await fetch(`${import.meta.env.BASE_URL}stimulation-config.json`);
        if (!r.ok)
            throw Error('Configuration missing');
        const c = await r.json();
        if (!Number.isInteger(c.maxChannels) || c.maxChannels < 1 || c.maxChannels > 256 || !Number.isFinite(c.defaultLimit) || c.defaultLimit <= 0 || !Number.isInteger(c.simulationFrequency) || c.simulationFrequency < 1 || c.simulationFrequency > 100000)
            throw Error('Invalid stimulation configuration');
        useStudio.setState({ maxChannels: c.maxChannels, settings: { frequency: c.simulationFrequency, limit: c.defaultLimit }, channels: Array(c.maxChannels).fill(0), history: Array.from({ length: c.maxChannels }, () => []), ready: true });
    }
    catch (e) {
        useStudio.setState({ message: (e as Error).message, state: 'fault' });
    }
}
