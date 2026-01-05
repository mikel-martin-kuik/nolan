import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class MessageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for debugging
    console.error('MessageRenderer error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI when markdown rendering fails
      return (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded">
          <div className="flex items-start gap-2">
            <span className="text-yellow-600 dark:text-yellow-400 font-semibold">⚠</span>
            <div className="flex-1">
              <div className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                Unable to render message
              </div>
              <div className="text-xs text-yellow-700 dark:text-yellow-300">
                This message contains malformed content and cannot be displayed properly.
              </div>
              {this.state.error && (
                <details className="mt-2">
                  <summary className="text-xs text-yellow-600 dark:text-yellow-400 cursor-pointer">
                    Error details
                  </summary>
                  <pre className="text-xs mt-1 text-yellow-700 dark:text-yellow-300 overflow-x-auto">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
