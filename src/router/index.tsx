import { createBrowserRouter, Navigate } from 'react-router-dom';
import WarrantyLayout from '@/layouts/warrantylayout';
import ProtectedRoute from '@/components/auth/protectedroute';
import LoginPage           from '@/pages/loginpage';
import MFASetupPage        from '@/pages/mfasetuppage';
import SettingsPage        from '@/pages/settingspage';
import MailPage            from '@/pages/mailpage';
import WarrantyTodayPage   from '@/pages/warrantytodaypage';
import CommunitiesPage     from '@/pages/communitiespage';
import LotsPage            from '@/pages/lotspage';
import HomesIndexPage      from '@/pages/homesindexpage';
import CommunityPage       from '@/pages/communitypage';
import LotDetailPage       from '@/pages/lotdetailpage';
import CasesPage           from '@/pages/casespage';
import CaseDetailPage      from '@/pages/casedetailpage';
import WorkOrdersPage      from '@/pages/workorderspage';
import PORequestsPage from '@/pages/poapprovalspage';
import ConciliationPage     from '@/pages/conciliationpage';
import ConciliationCasePage from '@/pages/conciliationcasepage';
import WarrantyReportsPage from '@/pages/warrantyreportspage';
import TarionImportPage from '@/pages/tarianimportpage';
import QDefImportPage from '@/pages/qdefimportpage';
import DeficiencyImportPage from '@/pages/deficiencyimportpage';
import TradesImportPage from '@/pages/tradesimportpage';






export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/warranty/today" replace /> },
  {
    path: '/warranty',
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        path: 'mail-window',
        element: (
          <ProtectedRoute>
            <div style={{ minHeight: '100vh', background: 'var(--color-canvas)' }}>
              <MailPage />
            </div>
          </ProtectedRoute>
        ),
      },
      {
        element: (
          <ProtectedRoute>
            <WarrantyLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true,         element: <Navigate to="today" replace /> },
          { path: 'today',       element: <WarrantyTodayPage />           },
          { path: 'communities', element: <CommunitiesPage />             },
          { path: 'communities/:projectId', element: <CommunityPage /> },
          { path: 'lots',        element: <HomesIndexPage />             },
          { path: 'lots/:id',    element: <LotDetailPage />              },
          { path: 'cases',       element: <CasesPage />                  },
          { path: 'cases/:id',   element: <CaseDetailPage />             },
          { path: 'work-orders', element: <WorkOrdersPage />             },
          { path: 'po-requests', element: <PORequestsPage />             },
          { path: 'conciliation',     element: <ConciliationPage />     },
          { path: 'conciliation/:id', element: <ConciliationCasePage /> },
          { path: 'settlements', element: <Navigate to="/warranty/conciliation" replace /> },
          { path: 'reports',     element: <WarrantyReportsPage />        },
          { path: 'mail',        element: <MailPage />                   },
          { path: 'settings',    element: <SettingsPage />               },
          { path: 'mfa-setup',   element: <MFASetupPage />               },
          { path: 'lots/:lotId/import-form', element: <TarionImportPage /> },
          { path: 'qdef-import', element: <QDefImportPage /> },
          { path: 'deficiency-import', element: <DeficiencyImportPage /> },
          { path: 'trades-import', element: <TradesImportPage /> }
          





          
        ],
      },
    ],
  },
]);