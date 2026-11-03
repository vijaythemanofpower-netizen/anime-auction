// Keeps one broken piece of the screen from blanking the whole page: if the arena (or
// anything wrapped in this) throws while drawing, show a short note instead and let the
// rest of the screen (controls, results, skip) keep working.
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode; resetKey?: string | number }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: unknown) { console.error('Part of the screen failed to draw:', error); }

  componentDidUpdate(prev: { resetKey?: string | number }) {
    // A new fight (or a new key) gets a fresh try.
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
