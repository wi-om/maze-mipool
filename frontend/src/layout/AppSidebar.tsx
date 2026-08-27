import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ChevronDownIcon } from "../icons";
import { useSidebar } from "../context/SidebarContext";
import SidebarWidget from "./SidebarWidget";
import { GuardedLink } from "../components/common/GuardedLink";
import {
    LayoutDashboard,
    FileText,
    Wallet,
    Gift,
    CircleDollarSign,
    Users,
    Settings,
    Link2,
} from "lucide-react";

type NavItem = {
    name: string;
    icon: React.ReactNode;
    path?: string;
    subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const AppSidebar: React.FC = () => {
    const { user } = useAuth();
    const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
    const location = useLocation();

    const [openSubmenu, setOpenSubmenu] = useState<{
        type: "main" | "finance" | "others";
        index: number;
    } | null>(null);
    const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const isActive = useCallback(
        (path: string) => {
            const current = location.pathname;
            if (path === "/dashboard") {
                return current === "/dashboard" || current === "/";
            }
            return current === path || current.startsWith(`${path}/`);
        },
        [location.pathname],
    );

    const getFilteredNavItems = useCallback((): NavItem[] => {
        return [
            {
                icon: <LayoutDashboard className="h-5 w-5" />,
                name: "Dashboard",
                path: "/dashboard",
            },
            {
                icon: <FileText className="h-5 w-5" />,
                name: "Contracts",
                subItems: [
                    { name: "EU Contract", path: "/contracts" },
                    { name: "CL Contract", path: "/cl-contracts" },
                ],
            },
            {
                icon: <Wallet className="h-5 w-5" />,
                name: "Wallets",
                subItems: [
                    { name: "EU Wallets", path: "/wallets" },
                    { name: "Transactions", path: "/wallets/transactions" },
                ],
            },
            {
                icon: <Gift className="h-5 w-5" />,
                name: "Rewards",
                subItems: [
                    { name: "EU Rewards", path: "/rewards/eu" },
                    { name: "Compare", path: "/rewards/compare" },
                    { name: "CL Rewards", path: "/rewards/cl" },
                    { name: "CM Wallet", path: "/rewards/cm-wallet" },
                    { name: "Live Distribution", path: "/rewards/live" },
                ],
            },
            {
                icon: <CircleDollarSign className="h-5 w-5" />,
                name: "Payouts",
                path: "/payouts",
            },
            {
                icon: <Link2 className="h-5 w-5" />,
                name: "Blockchain Data",
                path: "/blockchain-data",
            },
            {
                icon: <Users className="h-5 w-5" />,
                name: "Accounts",
                path: "/accounts",
            },
            {
                icon: <Settings className="h-5 w-5" />,
                name: "Settings",
                path: "/settings",
            },
        ];
    }, [user]);

    const filteredNavItems = useMemo(() => getFilteredNavItems(), [getFilteredNavItems]);

    const mainItems = useMemo(() => filteredNavItems, [filteredNavItems]);

    useEffect(() => {
        const submenuIndex = mainItems.findIndex((item) =>
            item.subItems?.some((sub) => isActive(sub.path)),
        );
        if (submenuIndex >= 0) {
            setOpenSubmenu({ type: "main", index: submenuIndex });
        }
    }, [location.pathname, mainItems, isActive]);

    const handleSubmenuToggle = useCallback(
        (index: number, menuType: "main" | "finance" | "others") => {
            setOpenSubmenu((prevOpenSubmenu) => {
                if (
                    prevOpenSubmenu &&
                    prevOpenSubmenu.type === menuType &&
                    prevOpenSubmenu.index === index
                ) {
                    return null;
                }
                return { type: menuType, index };
            });
        },
        [],
    );

    const renderMenuItems = (items: NavItem[], menuType: "main" | "finance" | "others") => (
        <ul className="flex flex-col gap-1">
            {items.map((nav, index) => {
                const submenuActive = nav.subItems?.some((sub) => isActive(sub.path)) ?? false;
                const submenuOpen = openSubmenu?.type === menuType && openSubmenu?.index === index;

                return (
                <li key={`${menuType}-${index}`}>
                    {nav.subItems ? (
                        <>
                            <button
                                onClick={() => handleSubmenuToggle(index, menuType)}
                                className={`menu-item group ${submenuOpen || submenuActive
                                    ? "menu-item-active"
                                    : "menu-item-inactive"
                                    } cursor-pointer ${!isExpanded && !isHovered
                                        ? "lg:justify-center"
                                        : "lg:justify-start"
                                    }`}
                            >
                                <span
                                    className={`menu-item-icon-size  ${submenuOpen || submenuActive
                                        ? "menu-item-icon-active"
                                        : "menu-item-icon-inactive"
                                        }`}
                                >
                                    {nav.icon}
                                </span>
                                {(isExpanded || isHovered || isMobileOpen) && (
                                    <span className="menu-item-text">{nav.name}</span>
                                )}
                                {(isExpanded || isHovered || isMobileOpen) && (
                                    <ChevronDownIcon
                                        className={`ml-auto w-5 h-5 transition-transform duration-200 ${submenuOpen
                                            ? "rotate-180 text-brand-500"
                                            : ""
                                            }`}
                                    />
                                )}
                            </button>
                            {(isExpanded || isHovered || isMobileOpen) && (
                                <div
                                    ref={(el) => {
                                        subMenuRefs.current[`${menuType}-${index}`] = el;
                                    }}
                                    className="overflow-hidden transition-all duration-300"
                                    style={{
                                        height: submenuOpen || submenuActive ? "auto" : "0px",
                                    }}
                                >
                                    <ul className="mt-2 space-y-1 ml-9">
                                        {nav.subItems.map((subItem) => (
                                            <li key={subItem.path}>
                                                <GuardedLink
                                                    to={subItem.path}
                                                    className={`menu-dropdown-item ${isActive(subItem.path)
                                                        ? "menu-dropdown-item-active"
                                                        : "menu-dropdown-item-inactive"
                                                        }`}
                                                >
                                                    {subItem.name}
                                                    <span className="flex items-center gap-1 ml-auto">
                                                        {subItem.new && (
                                                            <span
                                                                className={`ml-auto ${isActive(subItem.path)
                                                                    ? "menu-dropdown-badge-active"
                                                                    : "menu-dropdown-badge-inactive"
                                                                    } menu-dropdown-badge`}
                                                            >
                                                                new
                                                            </span>
                                                        )}
                                                        {subItem.pro && (
                                                            <span
                                                                className={`ml-auto ${isActive(subItem.path)
                                                                    ? "menu-dropdown-badge-active"
                                                                    : "menu-dropdown-badge-inactive"
                                                                    } menu-dropdown-badge`}
                                                            >
                                                                pro
                                                            </span>
                                                        )}
                                                    </span>
                                                </GuardedLink>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    ) : (
                        nav.path && (
                            <GuardedLink
                                to={nav.path}
                                className={`menu-item group ${isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                                    }`}
                            >
                                <span
                                    className={`menu-item-icon-size ${isActive(nav.path)
                                        ? "menu-item-icon-active"
                                        : "menu-item-icon-inactive"
                                        }`}
                                >
                                    {nav.icon}
                                </span>
                                {(isExpanded || isHovered || isMobileOpen) && (
                                    <span className="menu-item-text">{nav.name}</span>
                                )}
                            </GuardedLink>
                        )
                    )}
                </li>
                );
            })}
        </ul>
    );

    return (
        <aside
            className={`fixed flex flex-col top-0 left-0 z-50 h-screen bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 border-r border-gray-200 transition-all duration-300 ease-in-out
        ${isExpanded || isMobileOpen
                    ? "w-[290px]"
                    : isHovered
                        ? "w-[290px]"
                        : "w-[90px]"
                }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
            onMouseEnter={() => !isExpanded && setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                className={`shrink-0 px-5 py-6 flex ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
                    }`}
            >
                <GuardedLink to="/dashboard" className="text-2xl font-bold tracking-tight">
                    {isExpanded || isHovered || isMobileOpen ? (
                        <span className="bg-linear-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
                            MIPCC
                        </span>
                    ) : (
                        <span className="text-brand-600">M</span>
                    )}
                </GuardedLink>
            </div>
            <nav className="flex-1 min-h-0 overflow-y-auto admin-scroll px-3">
                {renderMenuItems(mainItems, "main")}
            </nav>
            {(isExpanded || isHovered || isMobileOpen) && (
                <div className="shrink-0 px-3 pb-5 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <SidebarWidget />
                </div>
            )}
        </aside>
    );
};

export default AppSidebar;
