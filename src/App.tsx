import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div style={{ padding: 32, fontFamily: 'sans-serif', color: '#6C7280', fontSize: 13 }}>Loading…</div>}>
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  );
}