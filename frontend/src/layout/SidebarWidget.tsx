import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useNavigationGuard } from "../components/common/GuardedLink";

export default function SidebarWidget() {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const { blockIfLocked } = useNavigationGuard();

    const handleLogout = () => {
        if (blockIfLocked()) return;
        logout();
        navigate("/signin");
    };

    return (
        <div className="w-full rounded-md bg-linear-to-br from-brand-50 to-brand-100/80 px-5 py-6 text-center border border-brand-200/60 dark:from-brand-950/40 dark:to-brand-900/20 dark:border-brand-800/30">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                <ShieldAlert className="h-5 w-5" />
            </div>
            <h3 className="mb-2 text-base font-semibold text-brand-900 dark:text-brand-100">
                Security Advisory
            </h3>
            <p className="mb-5 text-sm leading-relaxed text-brand-700/80 dark:text-brand-200/70">
                As a security protocol, we advise you to logout after every use.
            </p>
            <button
                onClick={handleLogout}
                className="flex items-center justify-center w-full py-3 px-4 font-medium text-white rounded-md bg-brand-600 text-sm hover:bg-brand-700 transition-colors"
            >
                Logout
            </button>
        </div>
    );
}
