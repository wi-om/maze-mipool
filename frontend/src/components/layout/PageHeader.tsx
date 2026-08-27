import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { GuardedLink } from "../common/GuardedLink";

export type BreadcrumbItem = {
    label: string;
    href?: string;
};

type PageHeaderProps = {
    title: string;
    breadcrumbs?: BreadcrumbItem[];
    children?: ReactNode;
};

export default function PageHeader({ title, breadcrumbs = [], children }: PageHeaderProps) {
    return (
        <div className="mb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h1>
                <div className="flex flex-wrap items-center justify-end gap-3 sm:ml-auto">
                    {children}
                    {breadcrumbs.length > 0 && (
                        <nav
                            aria-label="Breadcrumb"
                            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
                        >
                            {breadcrumbs.map((item, index) => (
                                <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
                                    {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                                    {item.href ? (
                                        <GuardedLink
                                            to={item.href}
                                            className="hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                        >
                                            {item.label}
                                        </GuardedLink>
                                    ) : (
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                                    )}
                                </span>
                            ))}
                        </nav>
                    )}
                </div>
            </div>
        </div>
    );
}
