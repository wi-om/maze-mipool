
export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="relative p-6 bg-surface z-1 dark:bg-gray-900 sm:p-0">
            <div className="relative flex flex-col justify-center w-full min-h-screen lg:flex-row dark:bg-gray-900 sm:p-0">
                <div className="flex flex-col flex-1 w-full max-w-md mx-auto justify-center px-4">
                    {children}
                </div>
                <div className="hidden w-full lg:w-1/2 lg:flex flex-col items-center justify-center bg-linear-to-br from-brand-600 to-brand-800 border-l border-brand-700 relative overflow-hidden">
                    {/* Grid Shape - Top Left */}
                    <div className="absolute top-0 left-0 z-0 opacity-20">
                        <img
                            src="/images/shape/grid-01.svg"
                            alt="Grid Shape Top"
                            className=""
                        />
                    </div>

                    {/* Grid Shape - Bottom Right (Mirrored) */}
                    <div className="absolute bottom-0 right-0 z-0 rotate-180 opacity-20">
                        <img
                            src="/images/shape/grid-01.svg"
                            alt="Grid Shape Bottom"
                            className=""
                        />
                    </div>

                    <div className="relative z-10 text-center px-8">
                        <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
                            MIPS Command Center
                        </h1>
                        <p className="text-brand-100 text-lg">
                            Manage and track your mining operations with precision.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
