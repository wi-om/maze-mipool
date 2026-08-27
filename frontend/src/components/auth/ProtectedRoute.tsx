import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isAuthenticated } from "../../api/services/authService";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isInitialized, user } = useAuth();
    const location = useLocation();

    if (!isInitialized) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-600" />
            </div>
        );
    }

    // Re-check on every route change so expired tokens cannot browse between tabs.
    if (!user || !isAuthenticated()) {
        return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
    }

    return <>{children}</>;
}
