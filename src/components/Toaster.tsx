import { useUi } from '../store/ui';

/** 轻提示 */
export default function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);

  if (!toasts.length) return null;

  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((item) => (
        <button key={item.id} type="button" className="toast" onClick={() => dismiss(item.id)}>
          {item.text}
        </button>
      ))}
    </div>
  );
}
