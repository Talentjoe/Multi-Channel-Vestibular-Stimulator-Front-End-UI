import type { BlockInstance, EdgeDefinition } from '../types/blocks';
import { nodeDef, variables } from './blockDefinitions';
export interface Settings {
    frequency: number;
    limit: number;
}
export interface Circuit {
    nodes: BlockInstance[];
    edges: EdgeDefinition[];
}
export interface Expr {
    op: string;
    value?: number;
    name?: string;
    args: Expr[];
}
const funcs: Record<string, (...x: number[]) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, log: Math.log, min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil };
export function parse(text: string): Expr {
    const tokens = text.match(/(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|\*\*|[^\s]/g) || [];
    let i = 0;
    function atom(): Expr {
        const token = tokens[i++];
        if (!token)
            throw Error('Incomplete expression');
        if (token === '+' || token === '-')
            return { op: token === '-' ? 'neg' : 'pos', args: [expression(2)] };
        if (token === '(') {
            const e = expression(0);
            if (tokens[i++] !== ')')
                throw Error('Expected )');
            return e;
        }
        if (/^\d|^\./.test(token) && Number.isFinite(Number(token)))
            return { op: 'num', value: Number(token), args: [] };
        if (/^[A-Za-z_]\w*$/.test(token)) {
            if (tokens[i] === '(') {
                if (!funcs[token])
                    throw Error(`Unknown function ${token}`);
                i++;
                const args = [expression(0)];
                while (tokens[i] === ',') {
                    i++;
                    args.push(expression(0));
                }
                if (tokens[i++] !== ')')
                    throw Error('Expected )');
                return { op: token, args };
            }
            return { op: 'var', name: token, args: [] };
        }
        throw Error(`Invalid token ${token}`);
    }
    function expression(min: number): Expr { let left = atom(); const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, '**': 3 }; while ((prec[tokens[i]] || 0) > min) {
        const op = tokens[i++];
        const right = expression(prec[op] - (prec[op] === 3 ? 1 : 0));
        left = { op, args: [left, right] };
    } return left; }
    const result = expression(0);
    if (i !== tokens.length)
        throw Error('Unexpected expression suffix');
    return result;
}
export function evaluate(e: Expr, scope: Record<string, number>): number {
    if (e.op === 'num')
        return e.value!;
    if (e.op === 'var') {
        const v = e.name === 'pi' ? Math.PI : e.name === 'e' ? Math.E : scope[e.name!];
        if (!Number.isFinite(v))
            throw Error(`Unknown variable ${e.name}`);
        return v;
    }
    const a = e.args.map(x => evaluate(x, scope));
    let v: number;
    switch (e.op) {
        case '+':
            v = a[0] + a[1];
            break;
        case '-':
            v = a[0] - a[1];
            break;
        case '*':
            v = a[0] * a[1];
            break;
        case '/':
            if (a[1] === 0)
                throw Error('Division by zero');
            v = a[0] / a[1];
            break;
        case '^':
        case '**':
            v = a[0] ** a[1];
            break;
        case 'neg':
            v = -a[0];
            break;
        case 'pos':
            v = a[0];
            break;
        default: v = funcs[e.op](...a);
    }
    if (!Number.isFinite(v))
        throw Error('Non-finite expression result');
    return v;
}
export function csvRows(text: string) {
    const rows = text.trim().split(/\r?\n/);
    if (rows.shift()?.trim() !== 'time,value')
        throw Error('CSV header must be time,value');
    const result = rows.map(line => { const j = line.indexOf(','); const time = Number(line.slice(0, j)); if (j < 0 || !Number.isFinite(time))
        throw Error('Invalid CSV time'); return { time, expr: parse(line.slice(j + 1).replace(/^"|"$/g, '')) }; });
    if (result.length < 2 || result[0].time !== 0 || result.some((r, i) => i > 0 && r.time <= result[i - 1].time))
        throw Error('CSV needs at least two rows starting at 0, strictly increasing');
    return result;
}
export function ordered(c: Circuit) {
    const done = new Set<string>(), stack = new Set<string>(), result: BlockInstance[] = [];
    function visit(n: BlockInstance) { if (stack.has(n.id))
        throw Error(`Cycle at ${n.id}`); if (done.has(n.id))
        return; stack.add(n.id); for (const e of c.edges.filter(e => e.targetBlockId === n.id)) {
        const s = c.nodes.find(x => x.id === e.sourceBlockId);
        if (!s)
            throw Error('Missing source');
        visit(s);
    } stack.delete(n.id); done.add(n.id); result.push(n); }
    c.nodes.forEach(visit);
    return result;
}
export function check(c: Circuit, n: number, settings: Settings) {
    if (!Number.isInteger(n) || n < 1 || n > 256 || !Number.isInteger(settings.frequency) || settings.frequency < 1 || settings.frequency > 100000 || !Number.isFinite(settings.limit) || settings.limit <= 0)
        throw Error('Invalid configuration / frequency / limit');
    const ids = new Set<string>(), channels = new Set<number>(), targets = new Set<string>();
    for (const node of c.nodes) {
        if (ids.has(node.id))
            throw Error('Duplicate node id');
        ids.add(node.id);
        const d = nodeDef(node);
        if (!d)
            throw Error(`Unknown block ${node.type}`);
        for (const p of d.params) {
            const v = node.params[p.key] ?? p.default;
            if (p.type === 'number' && (!Number.isFinite(Number(v)) || (p.min !== undefined && Number(v) < p.min) || (p.max !== undefined && Number(v) > p.max)))
                throw Error(`${node.id}: invalid ${p.key}`);
        }
        if(node.type==='dynamic_input'&&(!(Number(node.params.min)<Number(node.params.max))||Number(node.params.step)<=0||Number(node.params.value)<Number(node.params.min)||Number(node.params.value)>Number(node.params.max)))throw Error(`${node.id}: invalid slider range or initial value`);
        if (node.type === 'stimulate_output') {
            const ch = Number(node.params.channel);
            if (!Number.isInteger(ch) || ch < 1 || ch > n || channels.has(ch))
                throw Error(`${node.id}: duplicate / invalid output channel`);
            channels.add(ch);
        }
        if (node.type === 'wave_function' || node.type === 'wave_csv')
            variables(node);
        if (node.type === 'wave_function') {
            const expr = parse(String(node.params.expression));
            const scope = Object.fromEntries(variables(node).map(v => [v.key, v.default]));
            evaluate(expr, { ...scope, t: 0 });
        }
        if (node.type === 'wave_csv')
            csvRows(String(node.params.csv));
    }
    for (const e of c.edges) {
        const s = c.nodes.find(x => x.id === e.sourceBlockId), t = c.nodes.find(x => x.id === e.targetBlockId);
        const a = s && nodeDef(s)?.outputs.find(p => p.id === e.sourcePortId), b = t && nodeDef(t)?.inputs.find(p => p.id === e.targetPortId);
        if (!a || !b || a.signalType !== b.signalType)
            throw Error(`Invalid connection ${e.id}`);
        const key = `${e.targetBlockId}:${e.targetPortId}`;
        if (targets.has(key))
            throw Error('Multiple sources on one input');
        targets.add(key);
    }
    for (const node of c.nodes)
        for (const p of nodeDef(node)!.inputs)
            if (p.required !== false && !targets.has(`${node.id}:${p.id}`))
                throw Error(`${node.id}: missing ${p.name}`);
    ordered(c);
}
export function sample(c: Circuit, time: number, settings: Settings, count: number, memory: Record<string, number> = {}, external: Record<string, number> = {}) {
    const values: Record<string, number> = {}, channels = Array(count).fill(0) as number[];
    for (const node of ordered(c)) {
        const input = (port: string) => { const e = c.edges.find(e => e.targetBlockId === node.id && e.targetPortId === port); return e ? values[`${e.sourceBlockId}:${e.sourcePortId}`] : undefined; };
        const p = (key: string) => Number(input(`param:${key}`) ?? node.params[key] ?? nodeDef(node)?.params.find(x => x.key === key)?.default ?? 0);
        let outs: Record<string, number> = {};
        const a = input('a') ?? 0, b = input('b') ?? 0;
        if (node.type.startsWith('wave_')) {
            let y = 0;
            const kind = node.type.slice(5);
            const f = p('frequency');
            if (kind === 'constant')
                y = p('value');
            else {
                if (f <= 0 || !Number.isFinite(f))
                    throw Error(`${node.id}: frequency must be positive`);
                const t = time + p('phase') / 360 / f, phase = ((t * f) % 1 + 1) % 1;
                const duty = p('duty');
                if (['square', 'triangle'].includes(kind) && (duty <= 0 || duty >= 1))
                    throw Error('Duty / peak position must be between 0 and 1');
                switch (kind) {
                    case 'sine':
                        y = Math.sin(2 * Math.PI * phase);
                        break;
                    case 'cosine':
                        y = Math.cos(2 * Math.PI * phase);
                        break;
                    case 'square':
                        y = phase < duty ? 1 : -1;
                        break;
                    case 'triangle':
                        y = phase < duty ? -1 + 2 * phase / duty : 1 - 2 * (phase - duty) / (1 - duty);
                        break;
                    case 'sawtooth':
                        y = (2 * phase - 1) * (node.params.direction === 'falling' ? -1 : 1);
                        break;
                    case 'function':
                    case 'csv': {
                        const scope = Object.fromEntries(variables(node).map(v => [v.key, p(v.key)]));
                        if (kind === 'function')
                            y = evaluate(parse(String(node.params.expression)), { ...scope, t: t * f });
                        else {
                            const rows = csvRows(String(node.params.csv));
                            const end = rows[rows.length - 1].time;
                            if (Math.abs(end - 1 / f) > 1e-9)
                                throw Error('CSV last time must equal period');
                            const local = phase / f;
                            const i = Math.max(0, rows.findIndex((r, j) => j < rows.length - 1 && local >= r.time && local < rows[j + 1].time));
                            const l = rows[i], r = rows[i + 1];
                            const v = evaluate(l.expr, scope);
                            y = node.params.interpolation === 'step' ? v : v + (evaluate(r.expr, scope) - v) * (local - l.time) / (r.time - l.time);
                        }
                        break;
                    }
                }
                y = p('offset') + p('amplitude') * y;
            }
            outs = { positive: y, negative: -y };
        }
        else
            switch (node.type) {
                case 'dynamic_input': {const v=external[`${node.id}:out`]??p('value');if(!Number.isFinite(v)||v<p('min')||v>p('max'))throw Error(`${node.id}: dynamic input outside slider range`);outs={out:v};break;}
                case 'esp32_imu':
                    outs = { imu: external[`${node.id}:imu`] ?? 0 };
                    break;
                case 'add':
                    outs = { out: a + b };
                    break;
                case 'subtract':
                    outs = { out: a - b };
                    break;
                case 'negate':
                    outs = { out: -a };
                    break;
                case 'multiply':
                    outs = { out: a * b };
                    break;
                case 'divide':
                    if (b === 0)
                        throw Error(`${node.id}: division by zero`);
                    outs = { out: a / b };
                    break;
                case 'gain':
                    outs = { out: (input('in') ?? 0) * p('gain') };
                    break;
                case 'low_pass_filter':
                case 'emg_envelope': {
                    const v = node.type === 'emg_envelope' ? Math.abs(input('raw') ?? 0) : input('in') ?? 0;
                    const alpha = node.type === 'emg_envelope' ? Math.min(1, 1000 / settings.frequency / Math.max(1, p('window'))) : 1 - Math.exp(-2 * Math.PI * p('cutoff') / settings.frequency);
                    const y = (memory[node.id] ?? 0) + alpha * (v - (memory[node.id] ?? 0));
                    memory[node.id] = y;
                    outs = { [node.type === 'emg_envelope' ? 'envelope' : 'out']: y };
                    break;
                }
                case 'stimulate_output':
                    channels[p('channel') - 1] = input('in') ?? 0;
                    break;
            }
        for (const [port, v] of Object.entries(outs)) {
            if (!Number.isFinite(v))
                throw Error(`${node.id}: non-finite output`);
            values[`${node.id}:${port}`] = v;
        }
    }
    const sum = channels.reduce((a, b) => a + b, 0);
    if (channels.some(v => !Number.isFinite(v) || Math.abs(v) > settings.limit))
        throw Error('Stimulation amplitude exceeds +/-k');
    if (Math.abs(sum) > 1e-9 * Math.max(1, ...channels.map(Math.abs)))
        throw Error('Stimulation channel sum is not zero');
    return { channels, values, sum, time };
}
// Polynomial normalization uses exact rational coefficients, with opaque shared
// signal atoms. No numerical sampling is used to establish an identity.
type Q = [
    bigint,
    bigint
];
type Poly = Map<string, Q>;
const gcd = (a: bigint, b: bigint): bigint => b ? gcd(b, a % b) : a < 0n ? -a : a;
function q(a: bigint, b = 1n): Q { const d = gcd(a, b); return [a / d * (b < 0n ? -1n : 1n), b / d * (b < 0n ? -1n : 1n)]; }
function rational(x: number): Q { const [m, e = '0'] = String(x).split('e'); const digits = m.replace('.', ''); const power = Number(e) - (m.split('.')[1]?.length ?? 0); return power >= 0 ? q(BigInt(digits) * 10n ** BigInt(power)) : q(BigInt(digits), 10n ** BigInt(-power)); }
function plus(a: Poly, b: Poly, sign = 1n): Poly { const r = new Map(a); for (const [k, v] of b) {
    const u = r.get(k) ?? [0n, 1n];
    const w = q(u[0] * v[1] + sign * v[0] * u[1], u[1] * v[1]);
    if (w[0])
        r.set(k, w);
    else
        r.delete(k);
} return r; }
function times(a: Poly, b: Poly): Poly { let r: Poly = new Map(); for (const [k, u] of a)
    for (const [l, v] of b) {
        const key = [...k.split('|'), ...l.split('|')].filter(Boolean).sort().join('|');
        r = plus(r, new Map([[key, q(u[0] * v[0], u[1] * v[1])]]));
        if (r.size > 10000)
            throw Error('Expression too complex to prove');
    } return r; }
const constant = (n: number): Poly => n === 0 ? new Map() : new Map([['', rational(n)]]);
export function proveBalance(c: Circuit) {
    const cache = new Map<string, Poly>();
    const order = ordered(c);
    for (const node of order) {
        const atom = (port: string): Poly => new Map([[`${node.id}:${port}`, [1n, 1n]]]);
        const input = (port: string): Poly => { const e = c.edges.find(e => e.targetBlockId === node.id && e.targetPortId === port); return e ? cache.get(`${e.sourceBlockId}:${e.sourcePortId}`) ?? atom(port) : constant(0); };
        let out: Poly = atom('out');
        if (node.type.startsWith('wave_')) {
            out = node.type === 'wave_constant' && !c.edges.some(e => e.targetBlockId === node.id) ? constant(Number(node.params.value)) : atom('positive');
            cache.set(`${node.id}:positive`, out);
            cache.set(`${node.id}:negative`, times(out, constant(-1)));
            continue;
        }
        const a = input('a'), b = input('b');
        switch (node.type) {
            case 'add':
                out = plus(a, b);
                break;
            case 'subtract':
                out = plus(a, b, -1n);
                break;
            case 'negate':
                out = times(a, constant(-1));
                break;
            case 'multiply':
                out = times(a, b);
                break;
            case 'divide': {
                if (b.size !== 1 || !b.has('') || b.get('')![0] === 0n)
                    throw Error(`${node.id}: denominator cannot be proven nonzero`);
                const v = b.get('')!;
                out = times(a, new Map([['', q(v[1], v[0])]]));
                break;
            }
            case 'gain':
                out = times(input('in'), c.edges.some(e => e.targetBlockId === node.id && e.targetPortId === 'param:gain') ? input('param:gain') : constant(Number(node.params.gain)));
                break;
            case 'stimulate_output':
                out = input('in');
                break;
        }
        for (const p of nodeDef(node)!.outputs)
            cache.set(`${node.id}:${p.id}`, out);
        if (node.type === 'stimulate_output')
            cache.set(`${node.id}:channel`, out);
    }
    let sum: Poly = new Map();
    for (const n of c.nodes.filter(n => n.type === 'stimulate_output'))
        sum = plus(sum, cache.get(`${n.id}:channel`)!);
    if (sum.size)
        throw Error(`Channel sum cannot be proven zero: ${[...sum.keys()].map(k => k || 'constant').join(', ')}`);
    return true;
}
// Period analysis is structural: unsupported nonlinear compositions fail closed.
export function exportPeriod(c: Circuit, settings: Settings, count: number) {
    check(c, count, settings);
    proveBalance(c);
    const relevant = new Set<string>();
    const mark = (id: string) => { if (relevant.has(id))
        return; relevant.add(id); c.edges.filter(e => e.targetBlockId === id).forEach(e => mark(e.sourceBlockId)); };
    c.nodes.filter(n => n.type === 'stimulate_output').forEach(n => mark(n.id));
    c = { nodes: c.nodes.filter(n => relevant.has(n.id)), edges: c.edges.filter(e => relevant.has(e.targetBlockId)) };
    type Periodic = {
        constant?: number;
        terms: Map<string, {
            coefficient: number;
            frequency: number;
            kind: string;
        }>;
    };
    const cache = new Map<string, Periodic>();
    const fixed = (v: number): Periodic => ({ constant: v, terms: new Map() });
    const scale = (a: Periodic, k: number): Periodic => ({ constant: (a.constant ?? 0) * k, terms: new Map([...a.terms].map(([id, t]) => [id, { ...t, coefficient: t.coefficient * k }]).filter(([, t]) => (t as {
            coefficient: number;
        }).coefficient !== 0) as [
            string,
            {
                coefficient: number;
                frequency: number;
                kind: string;
            }
        ][]) });
    const merge = (a: Periodic, b: Periodic, sign = 1): Periodic => { const r = scale(a, 1); r.constant = (a.constant ?? 0) + sign * (b.constant ?? 0); for (const [id, t] of b.terms) {
        const coefficient = (r.terms.get(id)?.coefficient ?? 0) + sign * t.coefficient;
        if (coefficient)
            r.terms.set(id, { ...t, coefficient });
        else
            r.terms.delete(id);
    } return r; };
    function functionPeriod(expr: Expr, scope: Record<string, number>): Periodic {
        const constantExpr = (e: Expr): boolean => e.op === 'var' ? e.name !== 't' : e.args.every(constantExpr);
        function affine(e: Expr): [
            number,
            number
        ] { if (constantExpr(e))
            return [0, evaluate(e, scope)]; if (e.op === 'var' && e.name === 't')
            return [1, 0]; const a = affine(e.args[0]); if (e.op === 'neg')
            return [-a[0], -a[1]]; if (e.op === 'pos')
            return a; const b = affine(e.args[1]); if (e.op === '+')
            return [a[0] + b[0], a[1] + b[1]]; if (e.op === '-')
            return [a[0] - b[0], a[1] - b[1]]; if (e.op === '*' && (a[0] === 0 || b[0] === 0))
            return [a[0] * b[1] + b[0] * a[1], a[1] * b[1]]; if (e.op === '/' && b[0] === 0 && b[1] !== 0)
            return [a[0] / b[1], a[1] / b[1]]; throw Error('Function time dependence is not affine'); }
        if (constantExpr(expr))
            return fixed(evaluate(expr, scope));
        if (expr.op === 'sin' || expr.op === 'cos') {
            const [a, b] = affine(expr.args[0]);
            if (a === 0)
                return fixed(expr.op === 'sin' ? Math.sin(b) : Math.cos(b));
            const f = Math.abs(a) / (2 * Math.PI);
            const phase = b + (expr.op === 'cos' ? Math.PI / 2 : 0);
            const key = `sine:${f}:${phase}`;
            return { constant: 0, terms: new Map([[key, { coefficient: a < 0 ? -1 : 1, frequency: f, kind: 'sine' }]]) };
        }
        if (expr.op === 'neg')
            return scale(functionPeriod(expr.args[0], scope), -1);
        if (expr.op === 'pos')
            return functionPeriod(expr.args[0], scope);
        if (expr.args.length < 2)
            throw Error('Minimum period cannot be proven for this time expression');
        const a = functionPeriod(expr.args[0], scope), b = functionPeriod(expr.args[1], scope);
        if (expr.op === '+')
            return merge(a, b);
        if (expr.op === '-')
            return merge(a, b, -1);
        if (expr.op === '*' && (!a.terms.size || !b.terms.size))
            return a.terms.size ? scale(a, b.constant ?? 0) : scale(b, a.constant ?? 0);
        if (expr.op === '/' && !b.terms.size && b.constant !== 0)
            return scale(a, 1 / b.constant!);
        throw Error('Minimum period cannot be proven for nonlinear function');
    }
    const outputPeriods: number[] = [];
    for (const n of ordered(c)) {
        const input = (port: string): Periodic => { const e = c.edges.find(e => e.targetBlockId === n.id && e.targetPortId === port); return e ? cache.get(`${e.sourceBlockId}:${e.sourcePortId}`) ?? fixed(0) : fixed(0); };
        const param = (key: string) => { const edge = c.edges.find(e => e.targetBlockId === n.id && e.targetPortId === `param:${key}`); if (edge) {
            const a = input(`param:${key}`);
            if (a.terms.size)
                throw Error(`${n.id}: dynamic parameter prevents period proof`);
            return a.constant ?? 0;
        } return Number(n.params[key] ?? nodeDef(n)?.params.find(p => p.key === key)?.default ?? 0); };
        let result = fixed(0);
        if (n.type.startsWith('wave_')) {
            if (n.type === 'wave_constant')
                result = fixed(param('value'));
            else if (param('amplitude') === 0)
                result = fixed(param('offset'));
            else if (n.type === 'wave_function') {
                const scope = Object.fromEntries(variables(n).map(v => [v.key, param(v.key)]));
                result = scale(functionPeriod(parse(String(n.params.expression)), scope), param('amplitude'));
                result.terms = new Map([...result.terms].map(([key, term]) => [`${key}:f${param('frequency')}`, { ...term, frequency: term.frequency * param('frequency') }]));
                result.constant = (result.constant ?? 0) + param('offset');
            }
            else {
                let f = param('frequency');
                let kind = n.type.slice(5);
                let signature = JSON.stringify(n.params);
                let coefficient = param('amplitude');
                if (kind === 'sine' || kind === 'cosine') {
                    let angle = ((param('phase') + (kind === 'cosine' ? 90 : 0)) % 360 + 360) % 360;
                    if ([0, 90, 180, 270].includes(angle)) {
                        if (angle >= 180) {
                            coefficient = -coefficient;
                            angle -= 180;
                        }
                        kind = angle === 0 ? 'sine' : 'cosine';
                        signature = String(f);
                    }
                    else
                        signature = String(f) + ':' + String(angle);
                }
                if (n.type === 'wave_csv') {
                    const rows = csvRows(String(n.params.csv)), scope = Object.fromEntries(variables(n).map(v => [v.key, param(v.key)]));
                    const vals = rows.map(r => evaluate(r.expr, scope));
                    const dt = rows[1].time;
                    if (rows.some((r, i) => Math.abs(r.time - i * dt) > 1e-10) || Math.abs(rows.at(-1)!.time - 1 / f) > 1e-9 || vals[0] !== vals.at(-1))
                        throw Error(`${n.id}: CSV period proof requires uniform time steps and matching endpoints`);
                    const size = vals.length - 1;
                    let length = size;
                    for (let k = 1; k <= size; k++)
                        if (size % k === 0 && vals.slice(0, size).every((v, i) => v === vals[i % k])) {
                            length = k;
                            break;
                        }
                    if (vals.every(v => v === vals[0])) {
                        result = fixed(param('offset') + param('amplitude') * vals[0]);
                        cache.set(`${n.id}:positive`, result);
                        cache.set(`${n.id}:negative`, scale(result, -1));
                        continue;
                    }
                    f = 1 / (length * dt);
                }
                if (!(f > 0))
                    throw Error('Invalid frequency');
                result = { constant: param('offset'), terms: new Map([[`${kind}:${signature}`, { coefficient, frequency: f, kind }]]) };
            }
            cache.set(`${n.id}:positive`, result);
            cache.set(`${n.id}:negative`, scale(result, -1));
            continue;
        }
        const a = input('a'), b = input('b');
        switch (n.type) {
            case 'dynamic_input':
            case 'esp32_imu':
                result = fixed(0);
                break;
            case 'add':
                result = merge(a, b);
                break;
            case 'subtract':
                result = merge(a, b, -1);
                break;
            case 'negate':
                result = scale(a, -1);
                break;
            case 'multiply':
                if (a.terms.size && b.terms.size)
                    throw Error(`${n.id}: nonlinear minimum period cannot be proven`);
                result = a.terms.size ? scale(a, b.constant ?? 0) : scale(b, a.constant ?? 0);
                break;
            case 'divide':
                if (b.terms.size || b.constant === 0)
                    throw Error(`${n.id}: varying or zero divisor`);
                result = scale(a, 1 / b.constant!);
                break;
            case 'gain':
                result = scale(input('in'), param('gain'));
                break;
            case 'low_pass_filter':
            case 'emg_envelope': {
                const x = input(n.type === 'emg_envelope' ? 'raw' : 'in');
                if (x.terms.size || x.constant !== 0)
                    throw Error(`${n.id}: stateful transient has no provable finite period`);
                result = fixed(0);
                break;
            }
            case 'stimulate_output':
                result = input('in');
                {
                    const fs = [...result.terms.values()].map(t => t.frequency);
                    if (new Set(fs).size !== fs.length)
                        throw Error(`${n.id}: unresolved equal-frequency phase combination`);
                }
                if (result.terms.size > 1 && [...result.terms.values()].some(t => !['sine', 'cosine'].includes(t.kind)))
                    throw Error(`${n.id}: minimum period of combined nonsinusoidal signals cannot be proven`);
                outputPeriods.push(...[...result.terms.values()].map(t => t.frequency));
                break;
        }
        for (const port of nodeDef(n)!.outputs)
            cache.set(`${n.id}:${port.id}`, result);
    }
    // Rational frequency gcd gives the least common period without repeated
    // floating-point modulo operations. Reject impractically large results.
    let frequency: Q | undefined;
    for (const f of outputPeriods) {
        const r = rational(f);
        if (r[0] <= 0n)
            throw Error('Invalid frequency');
        if (!frequency)
            frequency = r;
        else {
            const denominator = frequency[1] / gcd(frequency[1], r[1]) * r[1];
            frequency = q(gcd(frequency[0] * (denominator / frequency[1]), r[0] * (denominator / r[1])), denominator);
        }
    }
    const period = frequency ? Number(frequency[1]) / Number(frequency[0]) : 0;
    const rows = period ? Math.ceil(period * settings.frequency - 1e-10) : 1;
    if (!Number.isFinite(rows) || rows > 1000000)
        throw Error('Export exceeds one million samples');
    return { period, rows };
}
