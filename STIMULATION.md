# Waveforms and stimulation

## Quick start

Run `npm install`, then `npm run dev:mock` from this directory. The default
`npm run dev` still connects the ESP32 data source to rosbridge. The stimulation
transport is explicitly simulated in both modes; it never sends device commands.

The default sample contains four 1 Hz generators, a live Dynamic Input driving
all amplitudes (initial value 0.5), and Channel 1?8. Move the Live Amplitude
slider in its node or Front Panel while running. Each output pair still cancels.
Reload it with `public/examples/dynamic-eight-channels.rasproj.json`.

The static `public/examples/balanced-eight-channels.rasproj.json` uses a constant
amplitude instead; it exports 1000 samples over one second at 1000 Hz. Dynamic
Input is treated as an external source during export and therefore becomes zero.
The default live demo consequently exports a single all-zero row, as all channel
amplitudes become constant zero. To export nonzero periodic waves, use the static
example or replace the Dynamic Input with a Constant Wave.

To build the same arrangement, add a Sine Wave and two Stimulate Output blocks. Connect `positive` to channel 1
and `negative` to channel 2. Select **Validate Graph**, then **Run → Confirm Run**.
Open Front Panel to see channel traces, current values and their sum.

The palette contains three existing Signal Processing blocks,
CSV Recorder Mock, eight waveform generators, five arithmetic blocks and
Stimulate Output. Removed block types are dropped when loading old projects;
the status line reports migration. CSV Recorder Mock remains a placeholder.

## Parameters and custom waveforms

Each parameter definition has `externallySettable`, defaulting to `false`.
Waveform numerical parameters opt in and expose `param:<key>` input ports.
A connected input overrides the manual value; disconnect it to restore manual
editing. Channel numbers and expression/file configuration cannot be driven by
signals. Low Pass Filter and EMG Envelope support number and legacy signal modes.

Periodic waveforms expose frequency (Hz), period (s), amplitude, phase (degrees)
and offset. Frequency and period edit the same stored frequency. Square duty and
triangle peak position must lie strictly between zero and one. Each generator
emits `y` and `-y`, including offset.

Function Wave accepts arithmetic, powers, `sin`, `cos`, `tan`, `abs`, `sqrt`,
`exp`, `log`, `min`, `max`, `floor`, `ceil`, and constants `pi`, `e`.
Time `t` is elapsed generator cycles (elapsed seconds × frequency + phase/360).
For example, `a*sin(2*pi*t)` defines a variable-amplitude sine. JavaScript is not
executed. Declare variables in the Variables JSON field:

```json
[{"name":"a","default":0.5,"externallySettable":true}]
```

CSV Wave imports or edits `time,value` rows. Times are seconds, start at zero,
increase strictly, and end at the selected period. Values can reference declared
variables; wrap expressions containing commas in quotes. Choose linear or step
interpolation. CSV data and variable declarations are embedded in saved projects.

```csv
time,value
0,0
0.5,a
1,0
```

## Output constraints and configuration

Edit `public/stimulation-config.json` before loading the application. Defaults:
8 channels, limit `k=1`, simulation frequency 1000 Hz. Configuration errors block
startup. Global Settings edits positive `k` and integer simulation frequency
(1–100000 Hz); these values are saved per project. Channel numbers are unique
integers from 1 through the configured maximum. Values have no assigned physical
unit. Graphs and settings are locked while running or paused.

Run requires a symbolic proof that all stimulation channels sum identically to
zero. Shared signal atoms, opposite wave outputs, polynomial arithmetic and
constant division are supported. Uncancelled unknowns or unproven denominators
block execution. Different source nodes are independent atoms even if configured
similarly. This conservative proof may reject mathematically valid expressions.

Every simulated sample is also checked for finite values, zero sum (1e-9 scaled
tolerance), division by zero and each channel's `[-k,k]` bound. Violations fault
and zero outputs; values are never clipped. Pause preserves execution memory;
stop resets it. E-STOP requires RESET. Browser simulation is not hardware timing.

`StimulationTransport` defines asynchronous start, timestamped channel-frame
send, zero and stop operations. `SimulationTransport` is the current sink.
Implement the device protocol adapter before enabling physical output; no ROS
stimulation topic or device protocol is assumed.

## Period export and canvas

**Export Period CSV** takes an immutable snapshot and sets external data sources
to zero. Connected parameter signals still execute normally. It exports
`time_s,ch_1,…,ch_n` at `i/Fs` over `[0,T)`, with unused channels zero. Constants
produce one row. Export checks the same numerical constraints, runs in a separate
Worker, supports cancellation and refuses more than one million rows.

Period analysis supports native waves, affine-time sine/cosine function sums,
constant scaling and compatible arithmetic. Uniform CSV tables with matching
endpoints are checked for repeating patterns. Unsupported nonlinear combinations,
varying periods, irregular CSV proof cases and nonzero filter transients fail
with an explanation instead of an estimated period. External-zero expressions
that become invalid are rejected. Only stimulation ancestors affect period analysis.

Drag empty canvas space to select; Shift adds to selection. Drag selected blocks
as a group. Middle-drag or Space + drag pans; wheel zooms about the pointer.
Center fits all blocks; Delete/Backspace removes selected blocks and their wires.
Right-click provides selection, duplication and deletion actions. Coordinates
are unbounded, including negative coordinates; the viewport is saved in projects.

## Validation

`npm test` runs core Node/tsx tests. `npm run typecheck` and `npm run build`
validate compilation. With a development server running, use `npm run test:e2e`;
set `STUDIO_URL` to its URL (the script defaults to port 5174). Chrome must be
installed. The browser test verifies migration, runtime, pause/resume, emergency
reset, actual CSV download and bulk deletion.

Wave outputs stay at the original top-right terminals. Parameter inputs are
hollow gold circles on the left edge, aligned with the matching parameter
control below the Parameters disclosure. Normal data inputs remain triangular.
A connected parameter's editor is disabled in both the node and inspector.
Collapsing Parameters hides unconnected settings but keeps every connected
parameter row and its terminal visible; wires remain anchored by port ID.
The collapse state is saved with projects.
Tilt the mouse wheel or use horizontal trackpad scroll to pan sideways; Shift +
vertical wheel also pans horizontally. Middle-button dragging still pans freely.

## Live waveforms and dynamic input

Front Panel displays all Channel traces with fixed ?k vertical scales and up to
two seconds of history. Display refresh is configurable from 1?60 Hz, default
30 Hz, directly on Front Panel while running, or in Global Settings. It is saved
in projects independently of simulation frequency. Sampling and output validation
continue at the simulation frequency; display history is decimated to at most
1000 points/second to keep charts responsive.

Dynamic Input exposes one numerical output and a runtime slider in its node and
Front Panel. Configure initial value, minimum, maximum and step while stopped;
move the slider while running or paused. Live values survive pause/resume and a
subsequent run, but reload restores configured initial values. Saving a project
stores its configured initial values, not transient slider positions. The source
remains an unknown symbol during zero-sum preflight; it is not assumed constant.
It is a simulation control, not a physical stimulation-device command.
