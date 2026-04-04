import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppLayout } from '@/layouts/applayout';
import ProtectedRoute from '@/components/auth/protectedroute';
import LoginPage from '@/pages/loginpage';
import DashboardPage from '@/pages/dashboardpage';
import ClientsPage from '@/pages/clientspage';
import ClientDetailPage from '@/pages/clientdetailpage';
import OpportunitiesPage from '@/pages/opportunitiespage';
import ProjectsPage from '@/pages/projectspage';
import ProjectDetailPage from '@/pages/projectdetailpage';
import DispatchPage from '@/pages/dispatchpage';
import MFASetupPage from '@/pages/mfasetuppage';
import InvoicesPage from '@/pages/invoicespage';
import SettingsPage from '@/pages/settingspage';
import MailPage from '@/pages/mailpage';

function Placeholder({ name }: { name: string }) {
  return (
    <div style={{ padding: 40 }}>
      <h2>{name}</h2>
      <p>Page coming next.</p>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/forge/dashboard" replace /> },
  {
    path: '/forge',
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        element: (
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard',          element: <DashboardPage />      },
          { path: 'dispatch',           element: <DispatchPage />        },
          { path: 'clients',            element: <ClientsPage />         },
          { path: 'clients/:id',        element: <ClientDetailPage />    },
          { path: 'opportunities',      element: <OpportunitiesPage />   },
          { path: 'projects',           element: <ProjectsPage />        },
          { path: 'projects/:id',       element: <ProjectDetailPage />   },
          { path: 'quotes',             element: <Placeholder name="Quotes" />        },
          { path: 'workorders',         element: <Placeholder name="Work Orders" />   },
          { path: 'procurement',        element: <Placeholder name="Procurement" />   },
          { path: 'invoices', element: <InvoicesPage /> },
          { path: 'reports',            element: <Placeholder name="Reports" />       },
          { path: 'automations',        element: <Placeholder name="Automations" />   },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'mfa-setup', element: <MFASetupPage /> },
          { path: 'mail', element: <MailPage /> },
        ],
      },
    ],
  },
]);