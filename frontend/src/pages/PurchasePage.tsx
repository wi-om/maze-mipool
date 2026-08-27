import React from 'react';

const PurchasePage: React.FC = () => {
    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Purchase History</h1>
                <p className="text-gray-500">View and manage purchases</p>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-default dark:border-gray-800 dark:bg-gray-900">
                <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-xl font-semibold">Latest Transactions</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800">
                                <th className="p-4 text-sm font-medium text-gray-500 uppercase">ID</th>
                                <th className="p-4 text-sm font-medium text-gray-500 uppercase">Plan</th>
                                <th className="p-4 text-sm font-medium text-gray-500 uppercase">Amount</th>
                                <th className="p-4 text-sm font-medium text-gray-500 uppercase">Date</th>
                                <th className="p-4 text-sm font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3, 4, 5].map((i) => (
                                <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="p-4 text-sm text-gray-700 dark:text-gray-300">#TRX-00{i}</td>
                                    <td className="p-4 text-sm font-medium text-gray-900 dark:text-white">Premium Plan 10TB</td>
                                    <td className="p-4 text-sm text-gray-700 dark:text-gray-300">$1,200.00</td>
                                    <td className="p-4 text-sm text-gray-700 dark:text-gray-300">2026-01-08</td>
                                    <td className="p-4">
                                        <span className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800">
                                            Completed
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PurchasePage;
