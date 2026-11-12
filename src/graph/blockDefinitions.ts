import type { BlockDefinition, PortDefinition, ParamSpec } from '../types/blocks';
import type { SignalType } from '../types/signals';
import { getCustomDef } from '../state/blockRegistryStore';
/* ----- Registry builders: keep every block declaration below declarative ----- */
const out = (signalType: SignalType, name = 'out', id = name): PortDefinition => ({
    id,
    name,
    dir: 'out',
    signalType,
});
const inp = (signalType: SignalType, name = 'in', id = name, required = true): PortDefinition => ({ id, name, dir: 'in', signalType, required });
const num = (key: string, label: string, def: number, unit?: string, extra: Partial<ParamSpec> = {}): ParamSpec => ({ key, label, type: 'number', default: def, unit, ...extra });
const enumP = (key: string, label: string, options: Array<string | number>, def: string | number): ParamSpec => ({ key, label, type: 'enum', options, default: def });
// UI choices for generic simulated sources. ESP32 pair limits are declared on
// the esp32_imu block below and must agree with backend/firmware validation.
const RATE_OPTIONS = [100, 250, 500, 1000];
/**
 * The block registry: the catalogue of every block type the environment knows.
 * Adding ROS / plugin blocks later = adding entries here (+ executor cases).
 */
const LEGACY_DEFS: Record<string, BlockDefinition> = {
    /* ---------------- Sources ---------------- */
    fake_load_cell: {
        type: 'fake_load_cell',
        name: 'Fake Load Cell',
        category: 'Sources',
        runtime: 'mock',
        safeForMotorControl: false,
        inputs: [],
        outputs: [out('force3d', 'force')],
        params: [
            num('amplitude', 'Amplitude', 10, 'N'),
            num('frequency', 'Frequency', 1, 'Hz', { step: 0.1 }),
            num('noise', 'Noise', 0.2, '', { step: 0.05, min: 0, max: 1 }),
            enumP('sampleRate', 'Sample Rate', RATE_OPTIONS, 1000),
            enumP('outputType', 'Output Type', ['force3d', 'force1d', 'raw'], 'force3d'),
        ],
        description: '6-axis force/torque sensor mock (Newtons).',
    },
    fake_emg: {
        type: 'fake_emg',
        name: 'Fake EMG',
        category: 'Sources',
        runtime: 'mock',
        safeForMotorControl: false,
        inputs: [],
        outputs: [out('emg_signal', 'raw')],
        params: [
            num('channels', 'Channels', 8),
            num('gain', 'Gain', 1000, 'x'),
            enumP('sampleRate', 'Sample Rate', [1000, 2000, 4000], 2000),
        ],
        description: 'Surface EMG acquisition mock.',
    },
    esp32_imu: {
        type: 'esp32_imu',
        name: 'ESP32 IMU Pair',
        category: 'Sources',
        runtime: 'rosbridge',
        safeForMotorControl: false,
        inputs: [],
        outputs: [out('imu', 'imu')],
        params: [
            num('sampleRate', 'Pair Rate', 100, 'Hz', { min: 1, max: 1000 }),
            { key: 'filterEnabled', label: 'Filter', type: 'bool', default: true },
            enumP('accelRangeG', 'Accel Range', [2, 4, 8, 16], 2),
            enumP('gyroRangeDps', 'Gyro Range', [250, 500, 1000, 2000], 250),
            num('effectiveSampleRate', 'Effective Rate', 100, 'Hz', { min: 1, max: 1000 }),
        ],
        description: 'Live relative orientation from the master and slave ESP32 ROS streams.',
    },
    fake_motor_state: {
        type: 'fake_motor_state',
        name: 'Fake Motor State',
        category: 'Sources',
        runtime: 'mock',
        safeForMotorControl: false,
        inputs: [],
        outputs: [out('motor_state', 'state')],
        params: [num('maxTorque', 'Max Torque', 40, 'Nm'), enumP('gear', 'Gear Ratio', ['50:1', '100:1', '160:1'], '100:1')],
        description: 'Motor position / velocity / torque feedback mock.',
    },
    fake_red_pitaya_stream: {
        type: 'fake_red_pitaya_stream',
        name: 'Fake Red Pitaya Stream',
        category: 'Sources',
        runtime: 'mock',
        safeForMotorControl: false,
        inputs: [],
        outputs: [out('number', 'ch1')],
        params: [
            { key: 'ip', label: 'IP Address', type: 'text', default: '192.168.1.50' },
            enumP('sampleRate', 'Sample Rate', RATE_OPTIONS, 1000),
        ],
        description: 'Raw acquisition stream mock (TCP later).',
    },
    /* ---------------- Signal Processing ---------------- */
    low_pass_filter: {
        type: 'low_pass_filter',
        name: 'Low Pass Filter',
        category: 'Signal Processing',
        runtime: 'builtin',
        safeForMotorControl: true,
        inputs: [inp('force3d', 'in')],
        outputs: [out('force3d', 'out')],
        params: [
            num('cutoff', 'Cutoff', 6, 'Hz', { step: 0.5 }),
            enumP('filterType', 'Type', ['Butterworth', 'Bessel', 'Chebyshev'], 'Butterworth'),
            num('order', 'Order', 2, '', { min: 1, max: 8, step: 1 }),
        ],
        description: 'First/second order low pass filter.',
    },
    gain: {
        type: 'gain',
        name: 'Gain',
        category: 'Signal Processing',
        runtime: 'builtin',
        safeForMotorControl: true,
        inputs: [inp('number', 'in')],
        outputs: [out('number', 'out')],
        params: [num('gain', 'Gain', 1, 'x', { step: 0.1 })],
        description: 'Multiply input by a constant.',
    },
    emg_envelope: {
        type: 'emg_envelope',
        name: 'EMG Envelope',
        category: 'Signal Processing',
        runtime: 'builtin',
        safeForMotorControl: false,
        inputs: [inp('emg_signal', 'raw')],
        outputs: [out('emg_signal', 'envelope')],
        params: [
            num('window', 'Window', 50, 'ms', { step: 5 }),
            enumP('rectify', 'Rectify', ['Full-wave', 'Half-wave'], 'Full-wave'),
        ],
        description: 'Rectify + moving-average envelope.',
    },
    /* ---------------- Biomechanics ---------------- */
    opensim_ik_mock: {
        type: 'opensim_ik_mock',
        name: 'OpenSim IK Mock',
        category: 'Biomechanics',
        runtime: 'mock',
        safeForMotorControl: false,
        inputs: [inp('imu', 'imu')],
        outputs: [out('joint_state', 'angles')],
        params: [enumP('model', 'Model', ['gait2392', 'arm26', 'leg6dof'], 'gait2392'), enumP('solver', 'Solver', ['Least Squares', 'Kalman'], 'Least Squares')],
        description: 'Inverse-kinematics solver mock.',
    },
    opensim_ik_waiting: {
        type: 'opensim_ik_waiting',
        name: 'OpenSim IK',
        category: 'Biomechanics',
        runtime: 'rosbridge',
        safeForMotorControl: false,
        inputs: [inp('imu', 'imu')],
        outputs: [out('joint_state', 'angles')],
        params: [enumP('joint', 'Joint', ['Knee', 'Hip', 'Ankle'], 'Knee')],
        description: 'Official calibrated OpenSim IK from /opensim/joint_states. Emits only a valid, fresh product angle.',
    },
    opensim_ik_live: {
        type: 'opensim_ik_live',
        name: 'Relative Quat Angle (Debug)',
        category: 'Biomechanics',
        runtime: 'rosbridge',
        safeForMotorControl: false,
        inputs: [inp('imu', 'imu')],
        outputs: [out('joint_state', 'angles')],
        params: [enumP('joint', 'Joint', ['Knee', 'Hip', 'Ankle'], 'Knee')],
        description: 'Debug-only relative-quat Float64 from /opensim/joint_angle when enabled. Not product OpenSim IK.',
    },
    joint_angle_estimator_mock: {
        type: 'joint_angle_estimator_mock',
        name: 'Joint Angle Estimator Mock',
        category: 'Biomechanics',
        runtime: 'mock',
        safeForMotorControl: false,
        inputs: [inp('imu', 'imu')],
        outputs: [out('joint_state', 'angle')],
        params: [enumP('joint', 'Joint', ['Knee', 'Hip', 'Ankle', 'Elbow'], 'Knee')],
        description: 'Complementary-filter joint angle mock.',
    },
    /* ---------------- Control ---------------- */
    safety_gate: {
        type: 'safety_gate',
        name: 'Safety Gate',
        category: 'Control',
        runtime: 'builtin',
        safeForMotorControl: true,
        inputs: [inp('number', 'cmd')],
        outputs: [out('number', 'safe')],
        params: [num('forceLimit', 'Force Limit', 80, 'N'), num('velLimit', 'Vel Limit', 2, 'rad/s', { step: 0.1 }), enumP('onTrip', 'On Trip', ['Disable Motor', 'Hold'], 'Disable Motor')],
        description: 'Clamps commands to safe limits; trips on violation.',
    },
    admittance_controller_mock: {
        type: 'admittance_controller_mock',
        name: 'Admittance Controller Mock',
        category: 'Control',
        runtime: 'mock',
        safeForMotorControl: true,
        inputs: [inp('number', 'force')],
        outputs: [out('number', 'target')],
        params: [num('mass', 'Mass', 2, 'kg', { step: 0.1 }), num('damping', 'Damping', 20, '', { step: 1 }), num('stiffness', 'Stiffness', 0, '', { step: 1 })],
        description: 'Virtual mass-damper admittance law mock.',
    },
    motor_command_mock: {
        type: 'motor_command_mock',
        name: 'Motor Command Mock',
        category: 'Control',
        runtime: 'mock',
        safeForMotorControl: true,
        inputs: [inp('number', 'target')],
        outputs: [out('motor_state', 'cmd')],
        params: [enumP('mode', 'Mode', ['Torque', 'Position', 'Velocity'], 'Torque'), num('ramp', 'Ramp', 50, 'ms', { step: 5 }), num('watchdog', 'Watchdog', 100, 'ms', { step: 10 })],
        description: 'Generates motor command (EtherCAT later).',
    },
    /* ---------------- Indicators ---------------- */
    force_gauge: {
        type: 'force_gauge',
        name: 'Force Gauge',
        category: 'Indicators',
        runtime: 'builtin',
        safeForMotorControl: true,
        inputs: [inp('force3d', 'value')],
        outputs: [],
        params: [num('min', 'Min', -50, 'N'), num('max', 'Max', 50, 'N'), { key: 'units', label: 'Units', type: 'text', default: 'N' }],
        bodyKind: 'gauge',
        description: 'Analog-style force gauge.',
    },
    emg_chart: {
        type: 'emg_chart',
        name: 'EMG Chart',
        category: 'Indicators',
        runtime: 'builtin',
        safeForMotorControl: true,
        inputs: [inp('emg_signal', 'series')],
        outputs: [],
        params: [num('window', 'Window', 5, 's', { step: 1 })],
        bodyKind: 'chart',
        description: 'Scrolling EMG plot.',
    },
    joint_angle_display: {
        type: 'joint_angle_display',
        name: 'Joint Angle Display',
        category: 'Indicators',
        runtime: 'builtin',
        safeForMotorControl: true,
        inputs: [inp('joint_state', 'angle')],
        outputs: [],
        params: [enumP('joint', 'Joint', ['Knee', 'Hip', 'Ankle'], 'Knee'), { key: 'units', label: 'Units', type: 'text', default: 'deg' }],
        bodyKind: 'angle',
        description: 'Numeric joint-angle readout.',
    },
    motor_state_indicator: {
        type: 'motor_state_indicator',
        name: 'Motor State Indicator',
        category: 'Indicators',
        runtime: 'builtin',
        safeForMotorControl: true,
        inputs: [inp('motor_state', 'state')],
        outputs: [],
        params: [],
        bodyKind: 'motor',
        description: 'Position / velocity / torque readout.',
    },
    /* ---------------- Recording ---------------- */
    csv_recorder_mock: {
        type: 'csv_recorder_mock',
        name: 'CSV Recorder Mock',
        category: 'Recording',
        runtime: 'mock',
        safeForMotorControl: true,
        inputs: [inp('number', 'in', 'in', false)],
        outputs: [],
        params: [{ key: 'path', label: 'Path', type: 'text', default: 'trial_001.csv' }, num('columns', 'Columns', 6)],
        description: 'Writes channels to CSV (file IO later).',
    },
    trial_metadata_mock: {
        type: 'trial_metadata_mock',
        name: 'Trial Metadata Mock',
        category: 'Recording',
        runtime: 'mock',
        safeForMotorControl: true,
        inputs: [],
        outputs: [out('event', 'meta')],
        params: [{ key: 'subject', label: 'Subject', type: 'text', default: 'S01' }, { key: 'trial', label: 'Trial', type: 'text', default: 'T01' }],
        description: 'Attaches subject/trial metadata.',
    },
    /* ---------------- User Plugins ---------------- */
    python_function_mock: {
        type: 'python_function_mock',
        name: 'Python Function Mock',
        category: 'User Plugins',
        runtime: 'plugin-later',
        safeForMotorControl: false,
        inputs: [inp('number', 'in')],
        outputs: [out('number', 'out')],
        params: [{ key: 'script', label: 'Script', type: 'text', default: 'process.py' }],
        description: 'User Python block (sandboxed exec later).',
    },
    matlab_function_mock: {
        type: 'matlab_function_mock',
        name: 'MATLAB Function Mock',
        category: 'User Plugins',
        runtime: 'plugin-later',
        safeForMotorControl: false,
        inputs: [inp('number', 'in')],
        outputs: [out('number', 'out')],
        params: [{ key: 'script', label: 'Script', type: 'text', default: 'process.m' }],
        description: 'User MATLAB block (engine bridge later).',
    },
};
export const BLOCK_DEFS: Record<string, BlockDefinition> = Object.fromEntries(['low_pass_filter', 'gain', 'emg_envelope', 'csv_recorder_mock'].map(key => [key, LEGACY_DEFS[key]]));
const external = (key: string, label: string, value: number) => num(key, label, value, undefined, { externallySettable: true });
for (const kind of ['sine', 'cosine', 'square', 'triangle', 'sawtooth', 'constant', 'function', 'csv']) {
    BLOCK_DEFS[`wave_${kind}`] = {
        type: `wave_${kind}`, name: `${kind[0].toUpperCase() + kind.slice(1)} Wave`, category: 'Wave Generators', runtime: 'builtin', safeForMotorControl: true,
        inputs: [], outputs: [out('number', 'positive'), out('number', 'negative')],
        params: kind === 'constant' ? [external('value', 'Value', 0)] : [
            external('frequency', 'Frequency (Hz)', 1), external('amplitude', 'Amplitude', 1), external('phase', 'Phase (degrees)', 0), external('offset', 'Offset', 0),
            ...(kind === 'square' || kind === 'triangle' ? [external('duty', 'Duty / peak position (0..1)', 0.5)] : []),
            ...(kind === 'sawtooth' ? [enumP('direction', 'Direction', ['rising', 'falling'], 'rising')] : []),
            ...(kind === 'function' ? [{ key: 'expression', label: 'Expression (t = elapsed cycles)', type: 'text' as const, default: 'sin(2*pi*t)' }] : []),
            ...(kind === 'function' || kind === 'csv' ? [{ key: 'variables', label: 'Variables JSON', type: 'text' as const, default: '[]' }] : []),
            ...(kind === 'csv' ? [{ key: 'csv', label: 'CSV (time,value)', type: 'text' as const, default: 'time,value\n0,0\n0.5,1\n1,0' }, enumP('interpolation', 'Interpolation', ['linear', 'step'], 'linear')] : []),
        ], description: 'Complementary outputs y and -y.'
    };
}
for (const kind of ['add', 'subtract', 'negate', 'multiply', 'divide'])
    BLOCK_DEFS[kind] = {
        type: kind, name: kind[0].toUpperCase() + kind.slice(1), category: 'Arithmetic', runtime: 'builtin', safeForMotorControl: true,
        inputs: kind === 'negate' ? [inp('number', 'a')] : [inp('number', 'a'), inp('number', 'b')], outputs: [out('number')], params: []
    };
BLOCK_DEFS.stimulate_output = { type: 'stimulate_output', name: 'Channel', category: 'Stimulation', runtime: 'builtin', safeForMotorControl: true,
    inputs: [inp('number')], outputs: [], params: [num('channel', 'Output channel', 1, '', { min: 1, step: 1 })] };
BLOCK_DEFS.dynamic_input = {type:'dynamic_input',name:'Dynamic Input',category:'Sources',runtime:'mock',safeForMotorControl:true,
  inputs:[],outputs:[out('number')],params:[num('value','Initial value',0.5),num('min','Slider minimum',0),num('max','Slider maximum',1),num('step','Slider step',0.01,'',{min:0.000001})],description:'Live simulated external input, adjustable while running.'};
for (const def of Object.values(BLOCK_DEFS)) {
    def.params = def.params.map(p => ({ externallySettable: false, ...p }));
}
export function variables(node: {
    params: Record<string, unknown>;
}) {
    const value = JSON.parse(String(node.params.variables || '[]'));
    if (!Array.isArray(value))
        throw new Error('Variables must be a JSON array');
    const names = new Set<string>();
    return value.map((v: any) => {
        if (!v || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v.name) || ['t', 'pi', 'e', 'frequency', 'amplitude', 'offset', 'phase', 'duty', 'csv', 'expression', 'variables', 'interpolation', 'direction'].includes(v.name) || names.has(v.name) || !Number.isFinite(v.default))
            throw new Error('Invalid or duplicate variable');
        names.add(v.name);
        return { key: v.name, label: v.name, default: v.default, type: 'number' as const, externallySettable: v.externallySettable === true };
    });
}
export function nodeDef(node: {
    type: string;
    params: Record<string, unknown>;
}): BlockDefinition | undefined {
    const def = BLOCK_DEFS[node.type];
    if (!def)
        return undefined;
    let extra: ParamSpec[] = [];
    try {
        if (node.type === 'wave_function' || node.type === 'wave_csv')
            extra = variables(node);
    }
    catch { }
    const params = [...def.params, ...extra];
    const numeric = ['low_pass_filter', 'emg_envelope'].includes(node.type) && node.params.signalMode === 'number';
    return { ...def, params, inputs: [...def.inputs.map(p => numeric ? { ...p, signalType: 'number' as const } : p), ...params.filter(p => p.externallySettable).map(p => ({ id: `param:${p.key}`, name: p.label, dir: 'in' as const, signalType: 'number' as const, required: false }))], outputs: def.outputs.map(p => numeric ? { ...p, signalType: 'number' as const } : p) };
}
for (const key of ['low_pass_filter', 'emg_envelope'])
    BLOCK_DEFS[key].params.push(enumP('signalMode', 'Signal mode', ['number', 'legacy'], 'number'));
export function getDef(type: string): BlockDefinition | undefined { return BLOCK_DEFS[type]; }
/** Default params object derived from a definition's ParamSpecs. */
export function defaultParams(type: string): Record<string, string | number | boolean> {
    const def = BLOCK_DEFS[type];
    const params: Record<string, string | number | boolean> = {};
    if (!def)
        return params;
    for (const p of def.params)
        params[p.key] = p.default;
    return params;
}
/** Ordered category list for the palette. */
export const CATEGORY_ORDER: BlockDefinition['category'][] = ['Sources', 'Wave Generators', 'Signal Processing', 'Arithmetic', 'Stimulation', 'Recording'];
