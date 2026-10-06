import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

export function IntegrationDialog({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="integration-dialog"
      onCancel={onClose}
      aria-labelledby={titleId}
    >
      <header className="drawer-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={`关闭${title}`}
        >
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
