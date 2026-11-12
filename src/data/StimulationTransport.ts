export interface ChannelFrame {
    time: number;
    channels: number[];
}
export interface StimulationTransport {
    start(frequency: number): Promise<void>;
    send(frame: ChannelFrame): Promise<void>;
    zero(): Promise<void>;
    stop(): Promise<void>;
}
/** Explicit simulation sink. Replace by a protocol adapter for real hardware. */
export class SimulationTransport implements StimulationTransport {
    readonly mode = 'simulation';
    async start(_frequency: number) { }
    async send(_frame: ChannelFrame) { }
    async zero() { }
    async stop() { }
}
