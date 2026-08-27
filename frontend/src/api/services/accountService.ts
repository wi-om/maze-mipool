import apiClient from "../client";


export interface Account {
    ID: number;
    AcNo: string;
    Parent?: string;
    Type?: string;
    Status?: number;
    CreatedOn?: string;
}

export const getAllAccounts = async (): Promise<Account[]> => {
    const response = await apiClient.get("/api/accounts");
    return response.data;
};
