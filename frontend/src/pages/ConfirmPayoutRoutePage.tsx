import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/layout/PageHeader";
import { pageBreadcrumbs } from "../config/breadcrumbs";
import ConfirmPayoutPage, { usePayoutConfirmState } from "./payouts/ConfirmPayoutPage";

export default function ConfirmPayoutRoutePage() {
    const navigate = useNavigate();
    const state = usePayoutConfirmState();

    useEffect(() => {
        if (!state) {
            navigate("/payouts/add", { replace: true });
        }
    }, [state, navigate]);

    if (!state) {
        return null;
    }

    return (
        <div className="space-y-4">
            <PageHeader title="Confirm Payout" breadcrumbs={pageBreadcrumbs.confirmPayout} />
            <ConfirmPayoutPage state={state} />
        </div>
    );
}
