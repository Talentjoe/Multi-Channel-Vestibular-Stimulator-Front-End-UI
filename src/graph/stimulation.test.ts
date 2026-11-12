import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_DEFS, nodeDef } from './blockDefinitions';
import { parse, evaluate, check, proveBalance, sample, exportPeriod, type Circuit } from './stimulation';
import type { BlockInstance, EdgeDefinition } from '../types/blocks';
import { getDefaultGraphDocument, useGraphStore } from '../state/graphStore';
import { useStudio } from '../state/studioStore';
const settings = { frequency: 1000, limit: 10 };
function node(id: string, type: string, params: Record<string, number | string | boolean> = {}): BlockInstance { return { id, type, name: type, position: { x: 0, y: 0 }, status: 'idle', params: { ...Object.fromEntries(BLOCK_DEFS[type].params.map(p => [p.key, p.default])), ...params } }; }
function edge(source: string, port: string, target: string, input = 'in'): EdgeDefinition { return { id: `${source}-${port}-${target}-${input}`, sourceBlockId: source, sourcePortId: port, targetBlockId: target, targetPortId: input, signalType: 'number' }; }
function pair(type = 'wave_sine', params = {}): Circuit { return { nodes: [node('w', type, params), node('p', 'stimulate_output', { channel: 1 }), node('n', 'stimulate_output', { channel: 2 })], edges: [edge('w', 'positive', 'p'), edge('w', 'negative', 'n')] }; }
test('catalog retains exactly requested legacy blocks', () => { assert.equal(Object.keys(BLOCK_DEFS).length, 19); assert.equal(BLOCK_DEFS.fake_load_cell, undefined); assert.equal(BLOCK_DEFS.esp32_imu,undefined); });
test('safe expressions and operator precedence', () => { assert.equal(evaluate(parse('-2^2 + max(3,4)*2'), {}), 4); assert.equal(evaluate(parse('sin(pi/2)*a'), { a: 3 }), 3); assert.throws(() => parse('window.alert(1)')); assert.throws(() => evaluate(parse('x'), {})); assert.throws(() => evaluate(parse('1/0'), {})); });
for (const type of ['sine', 'cosine', 'square', 'triangle', 'sawtooth', 'constant', 'function', 'csv'])
    test(`${type} outputs cancel at every sample`, () => { const c = pair(`wave_${type}`); check(c, 8, settings); assert.ok(proveBalance(c)); for (let i = 0; i < 100; i++) {
        const r = sample(c, i / 100, settings, 8);
        assert.equal(r.channels[0] + r.channels[1], 0);
    } });
test('amplitude limit faults instead of clipping', () => assert.throws(() => sample(pair('wave_constant', { value: 11 }), 0, settings, 8), /amplitude/));
test('duplicate channels, missing inputs and cycles fail', () => { const c = pair(); c.nodes[2].params.channel = 1; assert.throws(() => check(c, 8, settings), /channel/); c.nodes[2].params.channel = 2; c.edges.pop(); assert.throws(() => check(c, 8, settings), /missing/); const a = node('a', 'negate'); assert.throws(() => check({ nodes: [a], edges: [edge('a', 'out', 'a', 'a')] }, 8, settings), /Cycle/); });
test('shared unknown cancels but different sources do not', () => { const c = pair(); c.nodes.push(node('w2', 'wave_sine')); c.edges[1] = edge('w2', 'negative', 'n'); assert.throws(() => proveBalance(c), /cannot be proven/); });
test('parameter binding overrides manual value', () => { const c = pair(); c.nodes.push(node('f', 'wave_constant', { value: 2 })); c.edges.push(edge('f', 'positive', 'w', 'param:frequency')); assert.ok(nodeDef(c.nodes[0])!.inputs.some(p => p.id === 'param:frequency')); assert.equal(BLOCK_DEFS.stimulate_output.params[0].externallySettable, false); assert.ok(Math.abs(sample(c, 0.125, settings, 8).channels[0] - 1) < 1e-10); });
test('rational common period of channels', () => { const c = pair('wave_sine', { frequency: 2 }); c.nodes.push(node('v', 'wave_sine', { frequency: 3 }), node('p2', 'stimulate_output', { channel: 3 }), node('n2', 'stimulate_output', { channel: 4 })); c.edges.push(edge('v', 'positive', 'p2'), edge('v', 'negative', 'n2')); assert.equal(exportPeriod(c, settings, 8).period, 1); });
test('constant export has one row', () => assert.equal(exportPeriod(pair('wave_constant'), settings, 8).rows, 1));
test('function period and nonperiodic rejection', () => { assert.equal(exportPeriod(pair('wave_function'), settings, 8).period, 1); assert.throws(() => exportPeriod(pair('wave_function', { expression: 't' }), settings, 8)); });
test('CSV period and malformed time', () => { assert.equal(exportPeriod(pair('wave_csv'), settings, 8).period, 1); assert.throws(() => check(pair('wave_csv', { csv: 'time,value\n0,0\n0,1' }), 8, settings)); });
test('unknown divisor cannot be canceled away', () => { const c = pair(); c.nodes.push(node('d', 'divide')); c.edges.push(edge('w', 'positive', 'd', 'a'), edge('w', 'positive', 'd', 'b')); assert.throws(() => proveBalance(c), /denominator/); });
test('distributivity is proven with exact coefficients', () => { const c = pair(); c.nodes.push(node('two', 'wave_constant', { value: 2 }), node('mul', 'multiply'), node('add', 'add')); c.edges.push(edge('w', 'positive', 'mul', 'a'), edge('two', 'positive', 'mul', 'b'), edge('w', 'negative', 'add', 'a'), edge('w', 'negative', 'add', 'b')); c.edges[0] = edge('mul', 'out', 'p'); c.edges[1] = edge('add', 'out', 'n'); assert.ok(proveBalance(c)); });
test('project migration removes obsolete nodes and advances IDs', () => { const c = pair(); useStudio.setState({ locked: false }); useGraphStore.getState().load(JSON.stringify({ version: 1, nodes: [...c.nodes, node('B99', 'wave_constant'), { ...node('old', 'wave_sine'), type: 'fake_emg' }], edges: c.edges })); assert.equal(useGraphStore.getState().nodes.length, 4); assert.ok(useGraphStore.getState().nextId > 99); });
test('channel and runtime locks cover store mutations', () => { useGraphStore.getState().load(JSON.stringify({ version: 2, ...pair() })); useGraphStore.getState().updateParam('p', 'channel', 2); assert.equal(useGraphStore.getState().nodes.find(n => n.id === 'p')!.params.channel, 1); useStudio.setState({ locked: true }); const count = useGraphStore.getState().nodes.length; useGraphStore.getState().addNode('wave_constant', 0, 0); useGraphStore.getState().removeNodes(['p']); assert.equal(useGraphStore.getState().nodes.length, count); useStudio.setState({ locked: false }); });
test('unreachable nonperiodic sources do not prevent period export', () => { const c = pair(); c.nodes.push(node('unused', 'wave_function', { expression: 't' })); assert.equal(exportPeriod(c, settings, 8).period, 1); });

test('starter sample is balanced, bounded, and exports external-zero snapshot',()=>{
 const c=getDefaultGraphDocument();check(c,8,settings);assert.ok(proveBalance(c));
 const result=sample(c,0.25,{frequency:1000,limit:1},8);
 assert.equal(result.channels[0],0.5);assert.equal(result.channels[1],-0.5);
 assert.equal(exportPeriod(c,{frequency:1000,limit:1},8).rows,1);
});

test('dynamic input updates all channels without defeating zero-sum proof',()=>{
 const c=getDefaultGraphDocument();check(c,8,settings);proveBalance(c);
 const low=sample(c,0.25,settings,8,{}, {'B2:out':0.2});
 const high=sample(c,0.25,settings,8,{}, {'B2:out':0.8});
 assert.equal(low.channels[0],0.2);assert.equal(high.channels[0],0.8);
 assert.equal(high.sum,0);assert.throws(()=>sample(c,0.25,settings,8,{}, {'B2:out':2}),/range/);
});
