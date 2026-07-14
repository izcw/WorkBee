import { X } from 'lucide-react';
import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ModalDialog({ title, ariaLabel = title, close, children, className = '', description }: {
  title: string;
  ariaLabel?: string;
  close: () => void;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
}) {
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => event.key === 'Escape' && close();
    addEventListener('keydown', dismiss);
    return () => removeEventListener('keydown', dismiss);
  }, [close]);

  const dismissBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };

  return createPortal(
    <div className="modal-overlay" onMouseDown={dismissBackdrop}>
      <section className={`modal-window ${className}`.trim()} role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <header className="modal-header">
          <div><strong>{title}</strong>{description && <p>{description}</p>}</div>
          <button onClick={close} aria-label={`关闭${ariaLabel}`}><X size={18}/></button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
