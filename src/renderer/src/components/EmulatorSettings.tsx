import React, { useEffect, useRef } from 'react';
import { Cpu } from 'lucide-react';
import { Modal } from './ui';
import { EmulatorManager } from './settings/EmulatorManager';

interface EmulatorSettingsProps {
  onClose: () => void;
  onConfigChanged: () => void;     // Ao fechar, se algo mudou: escaneia de novo
}

export const EmulatorSettings: React.FC<EmulatorSettingsProps> = ({ onClose, onConfigChanged }) => {
  const changed = useRef(false);
  const notifyChanged = useRef(onConfigChanged);
  notifyChanged.current = onConfigChanged;

  useEffect(
    () => () => {
      if (changed.current) notifyChanged.current();
      changed.current = false;
    },
    []
  );

  return (
    <Modal title="Emuladores e pastas de ROMs" icon={<Cpu className="w-4 h-4 text-indigo-400" />} size="xl" onClose={onClose}>
      <EmulatorManager onChanged={() => (changed.current = true)} />
    </Modal>
  );
};
