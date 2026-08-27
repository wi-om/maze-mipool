import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { NavigationLockProvider } from "../context/NavigationLockContext";
import { Outlet } from "react-router-dom";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";

const LayoutContent: React.FC = () => {
    const { isExpanded, isHovered, isMobileOpen } = useSidebar();

    return (
        <div className="h-screen overflow-hidden">
            <AppSidebar />
            <Backdrop />
            <div
                className={`flex h-screen flex-col overflow-hidden transition-[margin-left] duration-300 ease-in-out bg-surface text-gray-600 dark:text-gray-300 ${isExpanded || isHovered ? "lg:ml-[290px]" : "lg:ml-[90px]"
                    } ${isMobileOpen ? "ml-0" : ""}`}
            >
                <AppHeader />
                <main className="flex-1 overflow-y-auto admin-scroll">
                    <div className="w-full px-3 py-3 sm:px-4 sm:py-4">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

const AppLayout: React.FC = () => {
    return (
        <SidebarProvider>
            <NavigationLockProvider>
                <LayoutContent />
            </NavigationLockProvider>
        </SidebarProvider>
    );
};

export default AppLayout;
