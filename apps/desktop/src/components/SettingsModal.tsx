import { type ReactNode } from 'react';
import { ModalDialog } from './ModalDialog';
import './SettingsModal.css';

export function SettingsModal({ title, ariaLabel, description, close, children, className = '' }: {
  title: string;
  ariaLabel?: string;
  description?: ReactNode;
  close: () => void;
  children: ReactNode;
  className?: string;
}) {
  return <ModalDialog title={title} ariaLabel={ariaLabel} description={description} close={close} className={`settings-window ${className}`.trim()}>
    {children}
  </ModalDialog>;
}
