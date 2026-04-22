import React from 'react';
import ReactDOM from 'react-dom/client';
import { Prism } from './app';
import { usePrismDaylight } from './hooks/usePrismDaylight';

function PrismDaylight() {
  usePrismDaylight();
  return null;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  state = { err: null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  render() {
    if (this.state.err) {
      return (
        <div
          className="min-h-dvh bg-zinc-950 p-6 text-left font-mono text-sm text-rose-200"
          style={{ color: '#fecaca', background: '#09090b', padding: 24, whiteSpace: 'pre-wrap' }}
        >
          <h1 className="mb-2 text-base font-bold text-white">PRISM could not start</h1>
          <p className="mb-2 text-white/60">Open DevTools (F12) → Console for the full stack.</p>
          {String(this.state.err?.message || this.state.err)}
        </div>
      );
    }
    return this.props.children;
  }
}

function DevShellHint() {
  if (!import.meta.env.DEV) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-[200] rounded-md border border-white/[0.06] bg-black/25 px-2 py-1 text-[8px] font-serif font-normal tracking-[0.2em] text-white/[0.2] shadow-sm backdrop-blur-sm"
      title="Vite dev server — hot reload. Use npm run build + preview for production-like output."
    >
      Vite
    </div>
  );
}

export function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <div className="prism-glass-scroll relative z-10 min-h-dvh overflow-y-auto">
          <PrismDaylight />
          <div className="atmosphere" aria-hidden />
          <Prism />
          <DevShellHint />
        </div>
      </RootErrorBoundary>
    </React.StrictMode>,
  );
}
