import { BrowserRouter, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { FaroRoutes } from "@grafana/faro-react";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import AppLayout from "./layout/AppLayout";
import PurchasePage from "./pages/PurchasePage";
import PayoutsIndex from "./pages/PayoutsIndex";
import BlockchainDataIndex from "./pages/BlockchainDataIndex";
import AddPayoutRoutePage from "./pages/AddPayoutRoutePage";
import ConfirmPayoutRoutePage from "./pages/ConfirmPayoutRoutePage";
import ContractsPage from "./pages/ContractsPage";
import CLContractsPage from "./pages/CLContractsPage";
import AccountsPage from "./pages/AccountsPage";
import SignInPage from "./pages/auth/SignInPage";
import RewardsPage from "./pages/RewardsPage";
import RewardsComparePage from "./pages/rewards/RewardsComparePage";
import CLRewardsPage from "./pages/rewards/CLRewardsPage";
import CMWalletPage from "./pages/rewards/CMWalletPage";
import UnifiedDistributionPage from "./pages/rewards/UnifiedDistributionPage";
import SettingsPage from "./pages/SettingsPage";
import WalletsPage from "./pages/WalletsPage";
import WalletTxnPage from "./pages/wallets/WalletTxnPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));

function RouteFallback() {
    return (
        <div className="flex min-h-[40vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-600" />
        </div>
    );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <FaroRoutes>
            <Route path="/signin" element={<SignInPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route
                path="dashboard"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <DashboardPage />
                  </Suspense>
                }
              />
              <Route path="purchase" element={<PurchasePage />} />
              <Route path="display-purchase" element={<PurchasePage />} />
              <Route path="rewards" element={<Navigate to="/rewards/eu" replace />} />
              <Route path="rewards/eu" element={<RewardsPage />} />
              <Route path="rewards/compare" element={<RewardsComparePage />} />
              <Route path="rewards/cl" element={<CLRewardsPage />} />
              <Route path="rewards/cm-wallet" element={<CMWalletPage />} />
              <Route path="rewards/live" element={<UnifiedDistributionPage />} />
              <Route path="payouts" element={<PayoutsIndex />} />
              <Route path="blockchain-data" element={<BlockchainDataIndex />} />
              <Route path="payouts/add" element={<AddPayoutRoutePage />} />
              <Route path="payouts/add/confirm" element={<ConfirmPayoutRoutePage />} />
              <Route path="contracts" element={<ContractsPage />} />
              <Route path="cl-contracts" element={<CLContractsPage />} />
              <Route path="wallets" element={<WalletsPage />} />
              <Route path="wallets/transactions" element={<WalletTxnPage />} />
              <Route path="accounts" element={<AccountsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<div>Not Found</div>} />
            </Route>
          </FaroRoutes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
