import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import WarrantyLayout from '@/layouts/warrantylayout';
import ProtectedRoute from '@/components/auth/protectedroute';
import LoginPage           from '@/pages/loginpage';
import { isInstalledApp } from '@/lib/supabase';
import FieldLayout from '@/pages/field/fieldlayout';

const MFASetupPage = lazy(() => import('@/pages/mfasetuppage'));
const SettingsPage = lazy(() => import('@/pages/settingspage'));
const MailPage = lazy(() => import('@/pages/mailpage'));
const WarrantyTodayPage = lazy(() => import('@/pages/warrantytodaypage'));
const CommunitiesPage = lazy(() => import('@/pages/communitiespage'));
const LotsPage = lazy(() => import('@/pages/lotspage'));
const HomesIndexPage = lazy(() => import('@/pages/homesindexpage'));
const CommunityPage = lazy(() => import('@/pages/communitypage'));
const LotDetailPage = lazy(() => import('@/pages/lotdetailpage'));
const AgingPage = lazy(() => import('@/pages/agingpage'));
const DeficiencyReportsPage = lazy(() => import('@/pages/deficiencyreportspage'));
const MorningPlanPage = lazy(() => import('@/pages/morningplanpage'));
const CasesPage = lazy(() => import('@/pages/casespage'));
const CaseDetailPage = lazy(() => import('@/pages/casedetailpage'));
const WorkOrdersPage = lazy(() => import('@/pages/workorderspage'));
const PORequestsPage = lazy(() => import('@/pages/poapprovalspage'));
const ConciliationPage = lazy(() => import('@/pages/conciliationpage'));
const ConciliationCasePage = lazy(() => import('@/pages/conciliationcasepage'));
const WarrantyReportsPage = lazy(() => import('@/pages/warrantyreportspage'));
const TarionImportPage = lazy(() => import('@/pages/tarianimportpage'));
const QDefImportPage = lazy(() => import('@/pages/qdefimportpage'));
const DeficiencyImportPage = lazy(() => import('@/pages/deficiencyimportpage'));
const TradesImportPage = lazy(() => import('@/pages/tradesimportpage'));
const WorkOrderPortalPage = lazy(() => import('@/pages/workorderportalpage'));
const VisitCheckPage = lazy(() => import('@/pages/visitcheckpage'));
const InspectionPortalPage = lazy(() => import('@/pages/inspectionportalpage'));
const InspectionsPage = lazy(() => import('@/pages/inspectionspage'));
const FieldHome = lazy(() => import('@/pages/field/fieldhome'));
const InspectionPage = lazy(() => import('@/pages/field/inspectionpage'));






export const router = createBrowserRouter([
  { path: '/', element: <Navigate to={isInstalledApp() ? '/field' : '/warranty/today'} replace /> },
  { path: '/portal/work-order/:token', element: <WorkOrderPortalPage /> },
  { path: '/portal/visit/:token', element: <VisitCheckPage /> },
  { path: '/portal/inspection/:token', element: <InspectionPortalPage /> },
  {
    path: '/field',
    element: (<ProtectedRoute><FieldLayout /></ProtectedRoute>),
    children: [
      { index: true, element: <FieldHome /> },
      { path: 'inspection/:id', element: <InspectionPage /> },
    ],
  },
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
          { path: 'plan',        element: <MorningPlanPage />             },
          { path: 'aging',       element: <AgingPage />                   },
          { path: 'communities', element: <CommunitiesPage />             },
          { path: 'communities/:projectId', element: <CommunityPage /> },
          { path: 'lots',        element: <HomesIndexPage />             },
          { path: 'lots/:id',    element: <LotDetailPage />              },
          { path: 'cases',       element: <CasesPage />                  },
          { path: 'cases/:id',   element: <CaseDetailPage />             },
          { path: 'work-orders', element: <WorkOrdersPage />             },
          { path: 'inspections', element: <InspectionsPage /> },
          { path: 'po-requests', element: <PORequestsPage />             },
          { path: 'conciliation',     element: <ConciliationPage />     },
          { path: 'conciliation/:id', element: <ConciliationCasePage /> },
          { path: 'settlements', element: <Navigate to="/warranty/conciliation" replace /> },
          { path: 'reports',     element: <WarrantyReportsPage />        },
          { path: 'reports/deficiencies', element: <DeficiencyReportsPage /> },
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