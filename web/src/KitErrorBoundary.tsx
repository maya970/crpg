import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };

type State = { err: Error | null };

/** Wraps the wallet-powered game shell. */
export class KitErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[KitErrorBoundary]', err, info.componentStack);
  }

  render() {
    if (this.state.err) {
      const msg = this.state.err.message || String(this.state.err);
      return (
        <div
          style={{
            flex: 1,
            minHeight: 120,
            padding: '1.25rem',
            background: '#0f1620',
            color: '#e8eef5',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            lineHeight: 1.5,
            overflow: 'auto',
          }}
        >
          <p style={{ margin: '0 0 0.75rem', color: '#fca5a5', fontWeight: 600 }}>Could not load the wallet panel</p>
          <p style={{ margin: '0 0 0.75rem', color: '#94a3b8' }}>
            Try refreshing the page, disabling extensions that block scripts, or opening the site in another browser.
          </p>
          <pre
            style={{
              margin: 0,
              padding: '0.75rem',
              background: '#070b10',
              borderRadius: 8,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {msg}
          </pre>
          <p style={{ margin: '1rem 0 0', color: '#64748b', fontSize: 13 }}>If the problem continues, contact support.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
