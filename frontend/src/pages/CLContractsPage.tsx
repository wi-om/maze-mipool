import { useEffect, useState, useMemo } from "react";
import { getAllCLContracts, createCLContract, updateCLContract, getCLContractSummary, deleteCLContract, type CLContract } from "../api/services/clContractService";
import { initiateLogin, verifyOtp } from "../api/services/authService";
import { useAuth } from "../context/AuthContext";
import { DataTable, type Column } from "../components/common/DataTable";
import MetricCard from "../components/common/MetricCard";
import DateTimeCell from "../components/common/DateTimeCell";
import PageHeader from "../components/layout/PageHeader";
import { pageBreadcrumbs } from "../config/breadcrumbs";
import { dashboardPanelClass } from "../components/common/panelStyles";
import { Plus, Trash2, Activity } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "../components/ui/badge";
import { Edit2, FileText } from "lucide-react";
import { Button } from "../components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const formFieldClass = "space-y-1.5";
const formLabelClass = "text-sm font-medium text-gray-700 dark:text-gray-300";

export default function CLContractsPage() {
    const [contracts, setContracts] = useState<CLContract[]>([]);
    const [summary, setSummary] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentContractId, setCurrentContractId] = useState<number | null>(null);
    const { user } = useAuth();
    const [isOtpStep, setIsOtpStep] = useState(false);
    const [otpCode, setOtpCode] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [idToDelete, setIdToDelete] = useState<number | null>(null);
    const [selectedAcNo, setSelectedAcNo] = useState<string>("all");

    const canEdit = user?.role === "superadmin" || user?.role === "admin";
    
    // Default dates
    const today = format(new Date(), "yyyy-MM-dd");
    const nextYearDate = new Date();
    nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);
    const nextYear = format(nextYearDate, "yyyy-MM-dd");

    const [newContract, setNewContract] = useState<Partial<CLContract>>({
        AcNo: "MI93691907",
        ClientID: "defilabs",
        Hashrate: 1000,
        Status: 1,
        ContractStartDate: today,
        ContractEndDate: nextYear,
        ContractRef: "",
        Remark: "",
        hostingfee: 0,
        SLA: 0
    });

    const fetchContracts = async () => {
        setLoading(true);
        try {
            const contractData = await getAllCLContracts();
            setContracts(contractData);
            try {
                const summaryData = await getCLContractSummary();
                setSummary(summaryData);
            } catch (summaryError) {
                console.error("Failed to fetch CL contract summary", summaryError);
                setSummary([]);
            }
        } catch (error) {
            console.error("Failed to fetch CL contracts", error);
            toast.error("Failed to fetch CL contracts");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContracts();
    }, []);

    const selectedSummary = useMemo(() => {
        if (selectedAcNo === "all") {
            return {
                AcNo: "all",
                ClientID: "All accounts",
                ActiveContracts: summary.reduce((acc, item) => acc + Number(item.ActiveContracts || 0), 0),
                TotalHashrate: summary.reduce((acc, item) => acc + Number(item.TotalHashrate || 0), 0),
            };
        }
        return summary.find((item) => item.AcNo === selectedAcNo) ?? null;
    }, [summary, selectedAcNo]);

    const handleOpenAdd = () => {
        setIsEditing(false);
        setCurrentContractId(null);
        setNewContract({
            AcNo: "MI93691907",
            ClientID: "defilabs",
            Hashrate: 1000,
            Status: 1,
            ContractStartDate: today,
            ContractEndDate: nextYear,
            ContractRef: "",
            Remark: "",
            hostingfee: 0,
            SLA: 0
        });
        setIsOtpStep(false);
        setOtpCode("");
        setIsDialogOpen(true);
    };

    const handleEdit = (contract: CLContract) => {
        setIsEditing(true);
        setCurrentContractId(contract.Id!);
        setNewContract({
            AcNo: contract.AcNo || "",
            ClientID: contract.ClientID || "",
            Hashrate: Number(contract.Hashrate),
            Status: contract.Status,
            ContractStartDate: contract.ContractStartDate ? format(new Date(contract.ContractStartDate), "yyyy-MM-dd") : today,
            ContractEndDate: contract.ContractEndDate ? format(new Date(contract.ContractEndDate), "yyyy-MM-dd") : nextYear,
            ContractRef: contract.ContractRef || "",
            Remark: contract.Remark || "",
            hostingfee: Number(contract.hostingfee || 0),
            SLA: Number(contract.SLA || 0),
        });
        setIsOtpStep(false);
        setOtpCode("");
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!canEdit) {
            toast.error("You don't have permission to perform this action");
            return;
        }

        if (!isOtpStep) {
            // First time clicking Save - trigger OTP
            try {
                setIsSaving(true);
                await initiateLogin(user.email);
                setIsOtpStep(true);
                toast.info("OTP sent to your email for verification");
            } catch (error) {
                toast.error("Failed to send OTP");
            } finally {
                setIsSaving(false);
            }
            return;
        }

        // We are in OTP step
        if (!otpCode) {
            toast.error("Please enter the OTP code");
            return;
        }

        try {
            setIsSaving(true);
            // Verify OTP
            await verifyOtp(user.email, otpCode);
            
            // If OTP is valid, proceed with save
            if (isEditing && currentContractId) {
                await updateCLContract(currentContractId, newContract);
                toast.success("CL Contract updated successfully");
            } else {
                await createCLContract(newContract);
                toast.success("CL Contract added successfully");
            }
            setIsDialogOpen(false);
            fetchContracts();
        } catch (error) {
            console.error("Failed to save CL contract", error);
            toast.error("OTP Verification failed or internal error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (id: number) => {
        setIdToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!idToDelete) return;
        
        try {
            setLoading(true);
            await deleteCLContract(idToDelete);
            toast.success("CL Contract deleted successfully");
            fetchContracts();
            setIsDeleteModalOpen(false);
        } catch (error) {
            console.error("Failed to delete CL contract", error);
            toast.error("Failed to delete CL contract");
        } finally {
            setLoading(false);
            setIdToDelete(null);
        }
    };

    const statusLabel = (status?: number) => {
        switch (status?.toString()) {
            case "0": return "Inactive";
            case "1": return "Active";
            case "2": return "Expired";
            case "3": return "Cancelled";
            case "4": return "Down";
            default: return "Unknown";
        }
    };

    const columns: Column<CLContract>[] = [
        { header: "ID", accessor: "Id", sortable: true },
        { header: "Ref", accessor: "ContractRef", sortable: true },
        { header: "Client ID", accessor: "ClientID", sortable: true },
        { header: "Account No", accessor: "AcNo", sortable: true },
        {
            header: "Hashrate",
            accessor: (item) => item.Hashrate ? `${Number(item.Hashrate).toLocaleString()} TH` : "-",
            sortable: true,
            sortKey: "Hashrate"
        },
        {
            header: "Status",
            accessor: (item) => {
                const status = item.Status?.toString();
                let variant: "default" | "secondary" | "outline" | "destructive" = "secondary";
                let label = "Unknown";
                
                switch(status) {
                    case "0": label = "Inactive"; variant = "outline"; break;
                    case "1": label = "Active"; variant = "default"; break;
                    case "2": label = "Expired"; variant = "secondary"; break;
                    case "3": label = "Cancelled"; variant = "destructive"; break;
                    case "4": label = "Down"; variant = "destructive"; break;
                }
                return <Badge variant={variant}>{label}</Badge>
            },
            sortable: true,
            sortKey: "Status",
            searchValue: (item) => statusLabel(item.Status),
        },
        {
            header: "Start Date",
            accessor: (item) => <DateTimeCell value={item.ContractStartDate} />,
            sortable: true,
            sortKey: "ContractStartDate",
        },
        {
            header: "End Date",
            accessor: (item) => <DateTimeCell value={item.ContractEndDate} />,
            sortable: true,
            sortKey: "ContractEndDate",
        },
        {
            header: "Hosting Fee",
            accessor: (item) => item.hostingfee ? `${item.hostingfee}%` : "0%",
            sortable: true,
            sortKey: "hostingfee",
        },
        {
            header: "SLA",
            accessor: (item) => item.SLA ? `${item.SLA}%` : "0%",
            sortable: true,
            sortKey: "SLA",
        },
        {
            header: "Action",
            accessor: (row) => (
                <div className="flex items-center gap-1.5">
                    {canEdit && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(row)}
                                title="Edit contract"
                                className="h-8 w-8 p-0 border-brand-200 text-brand-600 shadow-none hover:bg-brand-50 hover:text-brand-700 dark:border-brand-800 dark:hover:bg-brand-500/10"
                            >
                                <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(row.Id!)}
                                title="Delete contract"
                                className="h-8 w-8 p-0 border-red-200 text-red-600 shadow-none hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:hover:bg-red-500/10"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <PageHeader title="CL Contract" breadcrumbs={pageBreadcrumbs.clContract}>
                {canEdit && (
                    <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) {
                        setIsOtpStep(false);
                        setOtpCode("");
                    }
                }}>
                    {canEdit && (
                        <Button onClick={handleOpenAdd} className="bg-brand-500 text-white hover:bg-brand-600">
                            <Plus className="h-4 w-4 mr-2" /> Add CL Contract
                        </Button>
                    )}
                    <DialogContent className="sm:max-w-[560px] rounded-md border border-gray-200 p-0 shadow-none dark:border-gray-700 overflow-hidden">
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <DialogHeader className="mb-0">
                                <DialogTitle>{isEditing ? "Edit CL Contract" : "Add New CL Contract"}</DialogTitle>
                                <DialogDescription>
                                    {isOtpStep
                                        ? "Please enter the OTP sent to your email to confirm these changes."
                                        : isEditing
                                          ? "Update the details for this Company Level contract."
                                          : "Enter the details for the new Company Level contract."}
                                </DialogDescription>
                            </DialogHeader>
                        </div>

                        {!isOtpStep ? (
                            <div className="grid gap-4 px-6 py-4 max-h-[70vh] overflow-y-auto admin-scroll">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className={formFieldClass}>
                                        <Label htmlFor="acno" className={formLabelClass}>Account No</Label>
                                        <Input
                                            id="acno"
                                            value={newContract.AcNo}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setNewContract({ ...newContract, AcNo: e.target.value })
                                            }
                                        />
                                    </div>
                                    <div className={formFieldClass}>
                                        <Label htmlFor="clientid" className={formLabelClass}>Client ID</Label>
                                        <Input
                                            id="clientid"
                                            value={newContract.ClientID}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setNewContract({ ...newContract, ClientID: e.target.value })
                                            }
                                        />
                                    </div>
                                </div>

                                <div className={formFieldClass}>
                                    <Label htmlFor="ref" className={formLabelClass}>Contract Ref</Label>
                                    <Input
                                        id="ref"
                                        placeholder="Order # / Reference"
                                        value={newContract.ContractRef}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            setNewContract({ ...newContract, ContractRef: e.target.value })
                                        }
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className={formFieldClass}>
                                        <Label htmlFor="hashrate" className={formLabelClass}>Hashrate (TH)</Label>
                                        <Input
                                            id="hashrate"
                                            type="number"
                                            value={newContract.Hashrate}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setNewContract({ ...newContract, Hashrate: Number(e.target.value) })
                                            }
                                        />
                                    </div>
                                    <div className={formFieldClass}>
                                        <Label htmlFor="status" className={formLabelClass}>Status</Label>
                                        <Select
                                            value={String(newContract.Status)}
                                            onValueChange={(val) => setNewContract({ ...newContract, Status: Number(val) })}
                                        >
                                            <SelectTrigger className="w-full h-9 shadow-none">
                                                <SelectValue placeholder="Select Status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">Active</SelectItem>
                                                <SelectItem value="0">Inactive</SelectItem>
                                                <SelectItem value="2">Expired</SelectItem>
                                                <SelectItem value="3">Cancelled</SelectItem>
                                                <SelectItem value="4">Down</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className={formFieldClass}>
                                        <Label htmlFor="startdate" className={formLabelClass}>Start Date</Label>
                                        <Input
                                            id="startdate"
                                            type="date"
                                            value={newContract.ContractStartDate}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setNewContract({ ...newContract, ContractStartDate: e.target.value })
                                            }
                                        />
                                    </div>
                                    <div className={formFieldClass}>
                                        <Label htmlFor="enddate" className={formLabelClass}>End Date</Label>
                                        <Input
                                            id="enddate"
                                            type="date"
                                            value={newContract.ContractEndDate}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setNewContract({ ...newContract, ContractEndDate: e.target.value })
                                            }
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className={formFieldClass}>
                                        <Label htmlFor="hostingfee" className={formLabelClass}>Hosting Fee (%)</Label>
                                        <Input
                                            id="hostingfee"
                                            type="number"
                                            value={newContract.hostingfee}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setNewContract({ ...newContract, hostingfee: Number(e.target.value) })
                                            }
                                        />
                                    </div>
                                    <div className={formFieldClass}>
                                        <Label htmlFor="sla" className={formLabelClass}>SLA (%)</Label>
                                        <Input
                                            id="sla"
                                            type="number"
                                            value={newContract.SLA}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setNewContract({ ...newContract, SLA: Number(e.target.value) })
                                            }
                                        />
                                    </div>
                                </div>

                                <div className={formFieldClass}>
                                    <Label htmlFor="remark" className={formLabelClass}>Remark</Label>
                                    <Input
                                        id="remark"
                                        value={newContract.Remark}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            setNewContract({ ...newContract, Remark: e.target.value })
                                        }
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="px-6 py-8">
                                <div className={formFieldClass}>
                                    <Label htmlFor="otp" className={formLabelClass}>OTP Code</Label>
                                    <Input
                                        id="otp"
                                        placeholder="Enter 6-digit code"
                                        value={otpCode}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOtpCode(e.target.value)}
                                        className="h-11 text-center text-lg tracking-widest"
                                        maxLength={6}
                                        autoFocus
                                    />
                                </div>
                                <p className="mt-3 text-center text-sm text-gray-500">
                                    Wait 1-2 minutes if the email doesn't arrive.
                                </p>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/30">
                            <Button
                                variant="outline"
                                onClick={() => setIsDialogOpen(false)}
                                disabled={isSaving}
                                className="h-9 shadow-none"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="h-9 min-w-[120px] bg-brand-500 text-white shadow-none hover:bg-brand-600"
                                disabled={isSaving}
                            >
                                {isSaving
                                    ? "Processing..."
                                    : isOtpStep
                                      ? "Verify & Save"
                                      : isEditing
                                        ? "Update Contract"
                                        : "Save Contract"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
                )}
            </PageHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MetricCard
                    title="Total CL Contracts"
                    value={contracts.length}
                    icon={<FileText className="h-5 w-5" />}
                    iconColor="text-brand-600"
                    loading={loading}
                />

                {loading ? (
                    <div className={dashboardPanelClass}>
                        <div className="animate-pulse space-y-3">
                            <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                            <div className="h-9 w-full max-w-[220px] rounded bg-gray-200 dark:bg-gray-700" />
                            <div className="h-7 w-28 rounded bg-gray-200 dark:bg-gray-700" />
                        </div>
                    </div>
                ) : (
                    <div className={dashboardPanelClass}>
                        <div
                            className="pointer-events-none absolute right-3 bottom-3 opacity-10 dark:opacity-[0.14] text-emerald-600"
                            aria-hidden
                        >
                            <div className="flex h-8 w-8 items-center justify-center [&_svg]:h-8 [&_svg]:w-8">
                                <Activity />
                            </div>
                        </div>

                        <div className="relative">
                            <div className="flex items-center justify-between gap-3 pr-10">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Hashrate</p>
                                <Select
                                    value={selectedAcNo}
                                    onValueChange={setSelectedAcNo}
                                    disabled={summary.length === 0}
                                >
                                    <SelectTrigger className="h-8 w-[148px] shrink-0 text-xs shadow-none">
                                        <SelectValue placeholder="Account no" />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        <SelectItem value="all">All accounts</SelectItem>
                                        {summary.map((item) => (
                                            <SelectItem key={item.AcNo} value={item.AcNo}>
                                                {item.AcNo}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                                {selectedSummary
                                    ? `${Number(selectedSummary.TotalHashrate).toLocaleString()} TH`
                                    : "—"}
                            </p>

                            {selectedSummary && (
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {selectedSummary.ActiveContracts} active contract
                                    {selectedSummary.ActiveContracts === 1 ? "" : "s"}
                                    {selectedAcNo !== "all" && selectedSummary.ClientID
                                        ? ` · ${selectedSummary.ClientID}`
                                        : ""}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
                <DialogContent className="sm:max-w-[400px] rounded-md border border-gray-200 p-0 shadow-none dark:border-gray-700 overflow-hidden">
                    <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                        <DialogHeader className="mb-0">
                            <DialogTitle className="flex items-center gap-2 text-red-600">
                                <Trash2 className="w-5 h-5" />
                                Delete CL Contract
                            </DialogTitle>
                            <DialogDescription className="py-1">
                                Are you sure you want to delete this contract? This action cannot be undone and will remove the hashrate association for this client.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/30">
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteModalOpen(false)}
                            className="h-9 shadow-none"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={loading}
                            className="h-9 bg-red-600 shadow-none hover:bg-red-700"
                        >
                            {loading ? "Deleting..." : "Delete Permanently"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <DataTable
                data={contracts}
                columns={columns}
                loading={loading}
                emptyMessage="No CL contracts found"
                searchPlaceholder="Search ref, client ID, account no, hashrate, status…"
                searchKeys={["Id", "ContractRef", "ClientID", "AcNo", "Hashrate", "Status", "Remark"]}
            />
        </div>
    );
}
