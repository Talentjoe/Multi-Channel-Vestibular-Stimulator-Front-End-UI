import { check, proveBalance, sample, exportPeriod, type Circuit, type Settings } from './stimulation';
let timer: ReturnType<typeof setInterval> | undefined;
let external:Record<string,number>={};
let resume: (() => void) | undefined;
self.onmessage = (event) => {
    if(event.data.mode==='inputs'){external=event.data.values;return;}
    if (event.data.mode === 'pause') {
        clearInterval(timer);
        return;
    }
    if (event.data.mode === 'resume') {
        resume?.();
        return;
    }
    clearInterval(timer);
    const { mode, circuit, settings, count } = event.data as {
        mode: string;
        circuit: Circuit;
        settings: Settings;
        count: number;
    };
    try {
        check(circuit, count, settings);
        proveBalance(circuit);
        if (mode === 'export') {
            const { period, rows } = exportPeriod(circuit, settings, count);
            const lines = [['time_s', ...Array.from({ length: count }, (_, i) => `ch_${i + 1}`)].join(',')];
            const memory = {};
            for (let i = 0; i < rows; i++) {
                const zeros=Object.fromEntries(circuit.nodes.filter(n=>n.type==='dynamic_input').map(n=>[`${n.id}:out`,0]));
                const r = sample(circuit, i / settings.frequency, settings, count, memory,zeros);
                lines.push([r.time, ...r.channels].join(','));
            }
            self.postMessage({ csv: lines.join('\n'), period, rows });
            return;
        }
        external=event.data.external??{};
        let index = Number(event.data.startIndex ?? 0);
        const memory: Record<string, number> = {};
        let start = performance.now() - index / settings.frequency * 1000;
        const tick = () => { try {
            const end = Math.floor((performance.now() - start) * settings.frequency / 1000);
            if (end - index > settings.frequency * 2)
                throw Error('Simulation fell behind');
            let r;
            const traces: number[][] = Array.from({ length: count }, () => []);
            while (index <= end) {
                r = sample(circuit, index++ / settings.frequency, settings, count, memory,external);
                if((index-1)%Math.max(1,Math.ceil(settings.frequency/1000))===0)r.channels.forEach((v, i) => traces[i].push(v));
            }
            if (r)
                self.postMessage({ ...r, traces, index });
        }
        catch (e) {
            clearInterval(timer);
            self.postMessage({ error: (e as Error).message });
        } };
        resume = () => { clearInterval(timer); start = performance.now() - index / settings.frequency * 1000; timer = setInterval(tick, 10); };
        resume();
    }
    catch (e) {
        self.postMessage({ error: (e as Error).message });
    }
};
