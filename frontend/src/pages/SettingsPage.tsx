import { useState, useEffect } from "react";
import apiClient from "../api/client";
import { getAllSettings, type SystemSetting } from "../api/services/settingsService";
import PageHeader from "../components/layout/PageHeader";
import { pageBreadcrumbs } from "../config/breadcrumbs";
import { dashboardPanelClass } from "../components/common/panelStyles";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { cn } from "@/lib/utils";
import { Save, Clock, User, CheckCircle2, AlertCircle, Building2 } from "lucide-react";

interface Client {
    ClientID: string;
    AdminEmail: string;
    MIPSAcNo: string;
}

const SETTING_KEYS = {
    samplingHashrate: "sampling_hashrate",
    ocFloor: "OC_floor",
    ocCeiling: "OC_ceiling",
    slaFloor: "SLA_floor",
    slaCeiling: "SLA_ceiling",
} as const;

function applySettingsFromList(settings: SystemSetting[]) {
    const byKey = new Map(settings.map((s) => [s.Key, s]));
    return {
        samplingHashrate: byKey.get(SETTING_KEYS.samplingHashrate)?.Value ?? "250",
        ocFloor: byKey.get(SETTING_KEYS.ocFloor)?.Value ?? "",
        ocCeiling: byKey.get(SETTING_KEYS.ocCeiling)?.Value ?? "",
        slaFloor: byKey.get(SETTING_KEYS.slaFloor)?.Value ?? "",
        slaCeiling: byKey.get(SETTING_KEYS.slaCeiling)?.Value ?? "",
        audit: byKey.get(SETTING_KEYS.samplingHashrate) ?? null,
    };
}

async function fetchClients(): Promise<Client[]> {
    try {
        const { data } = await apiClient.get<{ data: Client[] }>("/api/clients");
        return data.data || [];
    } catch (err) {
        console.error("Error fetching clients:", err);
        return [];
    }
}

const formFieldClass = "space-y-1.5";
const formLabelClass = "text-sm font-medium text-gray-700 dark:text-gray-300";
const hintClass = "min-h-8 text-xs text-gray-500 dark:text-gray-400";

function FieldSkeleton({ hint = true }: { hint?: boolean }) {
    return (
        <div className={formFieldClass}>
            <div className="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-9 w-full animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
            {hint && <div className="min-h-8 animate-pulse rounded bg-gray-100 dark:bg-gray-800/60" />}
        </div>
    );
}

function AuditRowSkeleton() {
    return (
        <div className="flex items-start gap-3">
            <div className="mt-0.5 h-4 w-4 shrink-0 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="min-h-10 flex-1 space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-36 max-w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            </div>
        </div>
    );
}

export default function SettingsPage() {
    const [samplingHashrate, setSamplingHashrate] = useState<string>("250");
    const [ocFloor, setOcFloor] = useState<string>("");
    const [ocCeiling, setOcCeiling] = useState<string>("");
    const [slaFloor, setSlaFloor] = useState<string>("");
    const [slaCeiling, setSlaCeiling] = useState<string>("");
    const [settingData, setSettingData] = useState<SystemSetting | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                const [settings, clientsResult] = await Promise.all([getAllSettings(), fetchClients()]);
                const parsed = applySettingsFromList(settings);
                setSamplingHashrate(parsed.samplingHashrate);
                setOcFloor(parsed.ocFloor);
                setOcCeiling(parsed.ocCeiling);
                setSlaFloor(parsed.slaFloor);
                setSlaCeiling(parsed.slaCeiling);
                setSettingData(parsed.audit);
                if (clientsResult) {
                    setClients(clientsResult);
                    if (clientsResult.length) {
                        setSelectedClient(clientsResult[0].ClientID);
                    }
                }
            } catch (err) {
                console.error("Error loading settings:", err);
            } finally {
                setLoading(false);
            }
        };
        void init();
    }, []);

    const reloadSettings = async () => {
        try {
            const settings = await getAllSettings();
            const parsed = applySettingsFromList(settings);
            setSamplingHashrate(parsed.samplingHashrate);
            setOcFloor(parsed.ocFloor);
            setOcCeiling(parsed.ocCeiling);
            setSlaFloor(parsed.slaFloor);
            setSlaCeiling(parsed.slaCeiling);
            setSettingData(parsed.audit);
        } catch (err) {
            console.error("Error reloading settings:", err);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);
        try {
            await Promise.all([
                apiClient.post("/api/settings/update", { key: "sampling_hashrate", value: samplingHashrate }),
                apiClient.post("/api/settings/update", { key: "OC_floor", value: ocFloor }),
                apiClient.post("/api/settings/update", { key: "OC_ceiling", value: ocCeiling }),
                apiClient.post("/api/settings/update", { key: "SLA_floor", value: slaFloor }),
                apiClient.post("/api/settings/update", { key: "SLA_ceiling", value: slaCeiling }),
            ]);
            setMessage({ type: "success", text: "Settings updated successfully!" });
            await reloadSettings();
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                "Failed to update settings";
            setMessage({ type: "error", text: msg });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <PageHeader title="System Settings" breadcrumbs={pageBreadcrumbs.settings} />

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className={`${dashboardPanelClass} overflow-hidden p-0 lg:col-span-2`}>
                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Hashrate Configuration</h3>
                    </div>

                    <form onSubmit={handleSave} className="space-y-4 p-4" aria-busy={loading}>
                        {loading ? (
                            <>
                                <FieldSkeleton />
                                <FieldSkeleton />
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <FieldSkeleton />
                                    <FieldSkeleton />
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <FieldSkeleton />
                                    <FieldSkeleton />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={formFieldClass}>
                                    <Label htmlFor="client" className={formLabelClass}>
                                        Select Client
                                    </Label>
                                    <Select value={selectedClient} onValueChange={setSelectedClient}>
                                        <SelectTrigger id="client" className="h-9 w-full shadow-none">
                                            <SelectValue placeholder="Select a client" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {clients.map((client) => (
                                                <SelectItem key={client.ClientID} value={client.ClientID}>
                                                    {client.ClientID} ({client.AdminEmail})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className={hintClass}>&nbsp;</p>
                                </div>

                                <div className={formFieldClass}>
                                    <Label htmlFor="sampling" className={formLabelClass}>
                                        Sampling Hashrate (TH/s)
                                    </Label>
                                    <Input
                                        id="sampling"
                                        type="number"
                                        value={samplingHashrate}
                                        onChange={(e) => setSamplingHashrate(e.target.value)}
                                        placeholder="e.g. 250"
                                        className="h-9 shadow-none"
                                        required
                                    />
                                    <p className={hintClass}>
                                        Used to scale live hashrate relative to the customer&apos;s total contracted capacity.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className={formFieldClass}>
                                        <Label htmlFor="oc-floor" className={formLabelClass}>
                                            OC Floor
                                        </Label>
                                        <Input
                                            id="oc-floor"
                                            type="number"
                                            step="0.0001"
                                            value={ocFloor}
                                            onChange={(e) => setOcFloor(e.target.value)}
                                            placeholder="e.g. 1.1720"
                                            className="h-9 shadow-none"
                                            required
                                        />
                                        <p className={hintClass}>Lower threshold for operational control.</p>
                                    </div>
                                    <div className={formFieldClass}>
                                        <Label htmlFor="oc-ceiling" className={formLabelClass}>
                                            OC Ceiling
                                        </Label>
                                        <Input
                                            id="oc-ceiling"
                                            type="number"
                                            step="0.0001"
                                            value={ocCeiling}
                                            onChange={(e) => setOcCeiling(e.target.value)}
                                            placeholder="e.g. 1.1750"
                                            className="h-9 shadow-none"
                                            required
                                        />
                                        <p className={hintClass}>Upper threshold for operational control.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className={formFieldClass}>
                                        <Label htmlFor="sla-floor" className={formLabelClass}>
                                            SLA Floor
                                        </Label>
                                        <Input
                                            id="sla-floor"
                                            type="number"
                                            step="0.0001"
                                            value={slaFloor}
                                            onChange={(e) => setSlaFloor(e.target.value)}
                                            placeholder="e.g. 0.9920"
                                            className="h-9 shadow-none"
                                            required
                                        />
                                        <p className={hintClass}>Lower SLA factor for daily reward distribution.</p>
                                    </div>
                                    <div className={formFieldClass}>
                                        <Label htmlFor="sla-ceiling" className={formLabelClass}>
                                            SLA Ceiling
                                        </Label>
                                        <Input
                                            id="sla-ceiling"
                                            type="number"
                                            step="0.0001"
                                            value={slaCeiling}
                                            onChange={(e) => setSlaCeiling(e.target.value)}
                                            placeholder="e.g. 0.9940"
                                            className="h-9 shadow-none"
                                            required
                                        />
                                        <p className={hintClass}>Upper SLA factor (random value between floor and ceiling).</p>
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="min-h-10">
                            {message && (
                                <div
                                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                                        message.type === "success"
                                            ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-500/10 dark:text-green-400"
                                            : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-400"
                                    }`}
                                >
                                    {message.type === "success" ? (
                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                    )}
                                    {message.text}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                            <Button
                                type="submit"
                                disabled={loading || saving}
                                className="h-9 min-w-[9.5rem] bg-brand-500 text-white shadow-none hover:bg-brand-600 disabled:opacity-50"
                            >
                                {saving ? (
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                                {saving ? "Saving…" : "Save Settings"}
                            </Button>
                        </div>
                    </form>
                </div>

                <div className={dashboardPanelClass}>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Audit Info</h4>
                    <div className="mt-4 space-y-4">
                        {loading ? (
                            <>
                                <AuditRowSkeleton />
                                <AuditRowSkeleton />
                                <AuditRowSkeleton />
                                <AuditRowSkeleton />
                            </>
                        ) : (
                            <>
                                <div className="flex items-start gap-3">
                                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                    <div className="min-h-10">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Selected Client ID</p>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                            {selectedClient || "—"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                    <div className="min-h-10">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Last Updated By</p>
                                        <p
                                            className={cn(
                                                "text-sm font-medium text-gray-900 dark:text-white",
                                                !settingData?.UpdatedBy && "text-gray-400",
                                            )}
                                        >
                                            {settingData?.UpdatedBy || "—"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                    <div className="min-h-10">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Last Updated At</p>
                                        <p className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                                            {settingData ? new Date(settingData.UpdatedAt).toLocaleString() : "—"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                    <div className="min-h-10">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Created At</p>
                                        <p className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                                            {settingData ? new Date(settingData.CreatedAt).toLocaleString() : "—"}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
