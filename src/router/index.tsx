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
import QuotesPage from '@/pages/quotespage';
import QuoteBuilderPage from '@/pages/quotebuilderpage';
import QuoteViewPage from '@/pages/quoteviewpage';
import QuoteSignPage from '@/pages/quotesignpage';
import InvoiceViewPage from '@/pages/invoiceviewpage';
import ReportsPage from '@/pages/reportspage';
import ExpensesPage from '@/pages/expensespage';
import ProcurementPage from '@/pages/procurementpage';
import ChangeOrdersPage from '@/pages/changeorderspage';

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
  { path: '/sign/:id', element: <QuoteSignPage /> },
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
          { path: 'workorders',         element: <Placeholder name="Work Orders" />   },
          { path: 'expenses', element: <ExpensesPage /> },
          { path: 'invoices',     element: <InvoicesPage />     },
          { path: 'invoices/:id', element: <InvoiceViewPage />  },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'automations',        element: <Placeholder name="Automations" />   },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'mfa-setup', element: <MFASetupPage /> },
          { path: 'mail', element: <MailPage /> },
          { path: 'quotes',     element: <QuotesPage />      },
          { path: 'quotes/new', element: <QuoteBuilderPage /> },
          { path: 'quotes/:id', element: <QuoteViewPage /> },
          { path: 'procurement',  element: <ProcurementPage />  },
          { path: 'change-orders', element: <ChangeOrdersPage /> },
          
          
          
        ],
      },
    ],
  },
]);