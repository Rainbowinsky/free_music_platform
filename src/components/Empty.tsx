import type { ReactNode } from 'react';

interface EmptyProps {
  title: string;
  desc?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export default function Empty({ title, desc, action, icon }: EmptyProps) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? '🎧'}</div>
      <p className="empty-title">{title}</p>
      {desc ? <p className="empty-desc">{desc}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}
