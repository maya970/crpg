import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };

type State = { err: Error | null };

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary]', err, info.componentStack);
  }

  render() {
    if (this.state.err) {
      const msg = this.state.err.message || String(this.state.err);
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: '1.5rem',
            background: '#070b10',
            color: '#e8eef5',
            fontFamily: 'system-ui, sans-serif',
            maxWidth: 520,
            margin: '0 auto',
          }}
        >
          <h1 style={{ fontSize: '1.1rem', marginTop: 0 }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', lineHeight: 1.5 }}>
            The app could not start. Try refreshing the page or using a different browser.
          </p>
          <pre
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: '#0f1620',
              border: '1px solid #1e2a3a',
              borderRadius: 8,
              fontSize: 12,
              overflow: 'auto',
              color: '#f87171',
            }}
          >
            {msg}
          </pre>
          <p style={{ color: '#7a8fa3', fontSize: 13, marginTop: '1rem' }}>If this keeps happening, contact support.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
