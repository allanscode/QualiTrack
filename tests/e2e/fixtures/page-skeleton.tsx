import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import { ThemeProvider } from '../../../src/providers/ThemeProvider';
import { PageSkeleton } from '../../../src/components/ui/PageSkeleton';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider><main className="min-h-screen bg-surface-bg p-5 sm:p-8"><PageSkeleton dashboard /></main></ThemeProvider>,
);
