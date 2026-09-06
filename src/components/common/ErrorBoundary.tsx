import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Shown above the error message, e.g. "History" */
  label?: string
  /** Render instead of the default fallback card */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render errors so one bad item can't blank the entire app.
 *
 * Without a boundary, a throw during render unmounts the whole React tree
 * and the user sees an empty page with no way to recover.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    const { children, fallback, label } = this.props

    if (!error) {
      return children
    }

    if (fallback) {
      return fallback(error, this.reset)
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div>
          <p className="font-medium">
            {label ? `Something went wrong loading ${label}.` : 'Something went wrong.'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={this.reset}>
            Try again
          </Button>
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      </div>
    )
  }
}
