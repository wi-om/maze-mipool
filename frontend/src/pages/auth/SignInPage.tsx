import { useEffect } from "react";
import AuthLayout from "../../components/auth/AuthLayout";
import LoginForm from "../../components/auth/LoginForm";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function SignInPage() {
    const { user, isInitialized } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (isInitialized && user) {
            navigate("/dashboard", { replace: true });
        }
    }, [user, isInitialized, navigate]);

    return (
        <AuthLayout>
            <LoginForm />
        </AuthLayout>
    );
}
