import { Component } from 'react';
import { reportError } from '../utils/errors';

const changed = (a = [], b = []) => a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));

// Keeps a crash in one part of the screen from taking the whole app with it (the
// root boundary in app/_layout.js ends the session). What throws while rendering
// below is reported, then `fallback` is drawn in its place: a node, or a function
// of { error, reset } where `reset` tries the children again. Left out, nothing
// is drawn.
//
// `resetKeys` clears the error by itself when any of its values change, so a
// part that failed once gets a fresh go the next time the user does something
// that would show it (opening a sheet, say) rather than staying dead. `onError`
// is called after the report, for whatever the parent needs to put right.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    reportError(error);
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && changed(prevProps.resetKeys, this.props.resetKeys)) this.reset();
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { fallback } = this.props;
    return typeof fallback === 'function' ? fallback({ error, reset: this.reset }) : (fallback ?? null);
  }
}
