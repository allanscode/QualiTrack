import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import { PageSkeleton } from '../../../src/components/ui/PageSkeleton';

document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).has('dark'));
createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-surface-bg p-5 sm:p-8"><PageSkeleton dashboard /></main>,
);
