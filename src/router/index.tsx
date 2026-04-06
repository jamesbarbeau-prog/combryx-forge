import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/layouts/applayout';
import ProtectedRoute from '@/components/auth/protectedroute';
import LoginPage from '@/pages/loginpage';
import MFASetupPage from '@/pages/mfasetuppage';
import SettingsPage from '@/pages/settingspage';
import MailPage from '@/pages/mailpage';

// Warranty pages (build these next)
import WarrantyTodayPage    from '@/pages/warrantytodaypage';
import CommunitiesPage      from '@/pages/communitiespage';
import LotsPage             from '@/pages/lotspage';
import LotDetailPage        from '@/pages/lotdetailpage';
import CasesPage            from '@/pages/casespage';
import CaseDetailPage       from '@/pages/casedetailpage';
import WorkOrdersPage       from '@/pages/workorderspage';
import PORequestsPage       from '@/pages/porequestspage';
import SettlementsPage      from '@/pages/settlementspage';
import WarrantyReportsPage  from '@/pages/warrantyreportspage';

function Placeholder({ name }: { name: string }) {
  return (
    <div style={{ padding: 40 }}>
      <h2>{name}</h2>
      <p>Coming soon.</p>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/warranty/today" replace /> },
  {
    path: '/warranty',
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        element: (
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <Navigate to="today" replace /> },
          { path: 'today',        element: <WarrantyTodayPage />   },
          { path: 'communities',  element: <CommunitiesPage />      },
          { path: 'lots',         element: <LotsPage />            },
          { path: 'lots/:id',     element: <LotDetailPage />       },
          { path: 'cases',        element: <CasesPage />           },
          { path: 'cases/:id',    element: <CaseDetailPage />      },
          { path: 'work-orders',  element: <WorkOrdersPage />      },
          { path: 'po-requests',  element: <PORequestsPage />      },
          { path: 'settlements',  element: <SettlementsPage />     },
          { path: 'reports',      element: <WarrantyReportsPage /> },
          { path: 'mail',         element: <MailPage />            },
          { path: 'settings',     element: <SettingsPage />        },
          { path: 'mfa-setup',    element: <MFASetupPage />        },
        ],
      },
    ],
  },
]);