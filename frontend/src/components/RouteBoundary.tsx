import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ErrorState } from '@/components/ui';

type Props = {
  /** Changing this resets the boundary — routing to a new page should clear a fault. */
  resetKey: string;
  children: ReactNode;
};

type State = { error: Error | null };

/**
 * A render fault in one page should cost that page, not the whole console. React
 * unmounts the entire tree on an uncaught error, so without a boundary a single
 * bad field read leaves a blank white document with the failure only in the
 * console — the worst possible failure mode for a tool whose job is to report
 * what it knows. This catches the fault, shows what threw, and lets the rest of
 * the shell (navigation, theme, command palette) keep working.
 */
export class RouteBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept for the browser console and any future reporting sink; the user-facing
    // copy below is deliberately shorter than this.
    console.error('Page render failed', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorState
        title="This page failed to render"
        detail={error.message}
        hint="The rest of the console is still usable. Reloading will retry this page; if it keeps failing, the shape of the data it expects has changed."
        onRetry={() => this.setState({ error: null })}
        retryLabel="Retry page"
      />
    );
  }
}
