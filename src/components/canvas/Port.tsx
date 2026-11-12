/** Visual endpoint of a BlockNode. Keep signal compatibility rules in graph/validation. */
import type { MouseEvent } from 'react';
import type { PortDefinition } from '../../types/blocks';
import { signalColor } from '../../theme/tokens';

interface Props {
  port: PortDefinition;
  /** Vertical center of this port relative to the node top, in px. */
  top: number;
  onWireStart?: (port: PortDefinition, event: MouseEvent<HTMLDivElement>) => void;
  onWireFinish?: (port: PortDefinition, event: MouseEvent<HTMLDivElement>) => void;
}

function Triangle({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="port-term-svg">
      <path d="M1 1 L9 5 L1 9 Z" fill={color} />
    </svg>
  );
}

/** A typed terminal rendered on the edge of a block. */
export function Port({ port, top, onWireStart, onWireFinish }: Props) {
  const color = signalColor[port.signalType];

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (port.dir === 'out') onWireStart?.(port, event);
  };

  const handleMouseUp = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (port.dir === 'in') onWireFinish?.(port, event);
  };

  return (
    <div data-port-id={port.id} title={port.id.startsWith('param:')?`Parameter input: ${port.name}`:port.name} className={`port port-${port.dir}${port.id.startsWith('param:')?' port-parameter':''}`} style={{ top }} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}>
      <span className="port-term">
        {port.id.startsWith('param:') ? <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.5" fill="#15181a" stroke="#c9a23a" strokeWidth="1.5"/></svg> : <Triangle color={color} />}
      </span>
      <span className="port-name">{port.name}</span>
    </div>
  );
}
