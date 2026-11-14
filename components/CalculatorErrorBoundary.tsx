'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { clearEvaluationCache } from '../lib/scientificEngine';

interface CalculatorErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface CalculatorErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  resetCounter: number;
}

export default class CalculatorErrorBoundary extends React.Component<
  CalculatorErrorBoundaryProps,
  CalculatorErrorBoundaryState
> {
  constructor(props: CalculatorErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      resetCounter: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<CalculatorErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected calculation error occurred.',
    };
  }

  componentDidCatch(_error: Error, _errorInfo: React.ErrorInfo): void {
    clearEvaluationCache();
  }

  handleReset = (): void => {
    clearEvaluationCache();
    this.setState((prev) => ({
      hasError: false,
      errorMessage: '',
      resetCounter: prev.resetCounter + 1,
    }));
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="w-full sm:max-w-4xl sm:mx-auto p-6 bg-white rounded-none sm:rounded-3xl border border-rose-200 shadow-sm flex flex-col items-center justify-center text-center gap-4 min-h-[320px]">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-bold text-slate-900">
              Calculator Recovery Mode
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {this.state.errorMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Calculator</span>
          </button>
        </div>
      );
    }

    return <React.Fragment key={this.state.resetCounter}>{this.props.children}</React.Fragment>;
  }
}
