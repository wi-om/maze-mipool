import { useState } from "react";
import { verifyOtp } from "../../api/services/authService";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

interface OtpFormProps {
    email: string;
    onBack: () => void;
}

export default function OtpForm({ email, onBack }: OtpFormProps) {
    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (otp.length !== 6) return setError("Please enter a 6-digit code");

        setLoading(true);
        setError("");
        try {
            const data = await verifyOtp(email, otp);
            if (data.token) {
                await login(data.user, data.token);
                navigate("/dashboard");
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Invalid or expired OTP.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-sm">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Verify OTP</h1>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                    We've sent a 6-digit code to <span className="font-medium text-gray-900 dark:text-white">{email}</span>.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="otp" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Verification Code
                    </label>
                    <input
                        id="otp"
                        type="text"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="000000"
                        className="w-full px-4 py-2 text-center text-2xl tracking-[1em] border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                        required
                        disabled={loading}
                    />
                </div>

                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                <button
                    type="submit"
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
                    disabled={loading}
                >
                    {loading ? "Verifying..." : "Verify & Login"}
                </button>

                <button
                    type="button"
                    onClick={onBack}
                    className="w-full text-gray-600 dark:text-gray-400 text-sm hover:underline"
                    disabled={loading}
                >
                    Change email
                </button>
            </form>
        </div>
    );
}
