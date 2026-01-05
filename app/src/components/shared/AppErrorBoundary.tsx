import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application error:', error, errorInfo);
    this.setState({ errorInfo });
    // Optional: Send to error tracking service
    // trackError(error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-center mb-4">
              <AlertCircle className="w-12 h-12 text-red-500" />
            </div>

            <h1 className="text-xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">
              Application Error
            </h1>

            <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
              Something went wrong. Try reloading the application or resetting the error state.
            </p>

            <details className="mb-6 bg-gray-50 dark:bg-gray-900 rounded p-3">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                Error details
              </summary>
              <div className="mt-3 space-y-2">
                {this.state.error && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      Message:
                    </p>
                    <pre className="text-xs text-red-600 dark:text-red-400 overflow-auto mt-1">
                      {this.state.error.message}
                    </pre>
                  </div>
                )}
                {this.state.error?.stack && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      Stack trace:
                    </p>
                    <pre className="text-xs text-gray-500 dark:text-gray-500 overflow-auto mt-1 max-h-40">
                      {this.state.error.stack}
                    </pre>
                  </div>
                )}
                {this.state.errorInfo && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      Component stack:
                    </p>
                    <pre className="text-xs text-gray-500 dark:text-gray-500 overflow-auto mt-1 max-h-40">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            </details>

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
